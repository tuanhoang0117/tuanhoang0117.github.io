import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CounterError,
  DEFAULT_RETRY_AFTER_MS,
  counterClientFromEnv,
  createHttpCounterClient,
  createLocalCounterClient,
  parseRetryAfter,
  type CounterFailure,
} from "./client";

const URL_ROOT = "https://counter.test";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function failureOf(promise: Promise<unknown>): Promise<CounterFailure> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CounterError);
  return (error as CounterError).failure;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("choosing a client", () => {
  it("uses the local client when no VITE_COUNTER_URL is set at all", () => {
    expect(counterClientFromEnv({}).kind).toBe("local");
    expect(counterClientFromEnv({ VITE_COUNTER_URL: "  " }).kind).toBe("local");
  });

  it("uses the local client for this build's env when it has no URL (dev and tests)", () => {
    expect(import.meta.env.VITE_COUNTER_URL).toBeUndefined();
    expect(counterClientFromEnv().kind).toBe("local");
  });

  it("uses the HTTP client when a URL is configured", () => {
    expect(counterClientFromEnv({ VITE_COUNTER_URL: URL_ROOT }).kind).toBe("http");
    vi.stubEnv("VITE_COUNTER_URL", URL_ROOT);
    expect(counterClientFromEnv().kind).toBe("http");
  });
});

describe("local client", () => {
  it("starts at 0 and adds each increment", async () => {
    const client = createLocalCounterClient();
    expect(await client.read()).toBe(0);
    expect(await client.increment(3)).toBe(3);
    expect(await client.increment(1)).toBe(4);
    expect(await client.read()).toBe(4);
  });
});

describe("HTTP client", () => {
  it("reads GET /count", async () => {
    const fetch = vi.fn(async () => json({ count: 41 }));
    const client = createHttpCounterClient(`${URL_ROOT}/`, { fetch });
    expect(await client.read()).toBe(41);
    expect(fetch).toHaveBeenCalledWith(
      `${URL_ROOT}/count`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("increments with POST /increment and a JSON { by } body", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json({ count: 47 }),
    );
    const client = createHttpCounterClient(URL_ROOT, { fetch });
    expect(await client.increment(6)).toBe(47);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${URL_ROOT}/increment`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ by: 6 });
  });

  it("reports a 429 with its Retry-After", async () => {
    const fetch = vi.fn(async () =>
      json({ error: "slow down" }, { status: 429, headers: { "Retry-After": "7" } }),
    );
    const failure = await failureOf(createHttpCounterClient(URL_ROOT, { fetch }).increment(1));
    expect(failure).toEqual({ kind: "rate-limited", retryAfterMs: 7000 });
  });

  it("calls 5xx retryable and 4xx not", async () => {
    const status = (code: number) =>
      failureOf(
        createHttpCounterClient(URL_ROOT, {
          fetch: async () => json({ error: "x" }, { status: code }),
        }).increment(1),
      );
    expect(await status(503)).toEqual({ kind: "rejected", status: 503, retryable: true });
    expect(await status(403)).toEqual({ kind: "rejected", status: 403, retryable: false });
    expect(await status(400)).toEqual({ kind: "rejected", status: 400, retryable: false });
  });

  it("never retries a 200 without a count, since that increment did land", async () => {
    const fetch = vi.fn(async () => new Response("not json", { status: 200 }));
    const failure = await failureOf(createHttpCounterClient(URL_ROOT, { fetch }).increment(1));
    expect(failure).toEqual({ kind: "rejected", status: 200, retryable: false });
  });

  it("reports a fetch that throws as a network failure", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await failureOf(createHttpCounterClient(URL_ROOT, { fetch }).read())).toEqual({
      kind: "network",
    });
  });

  it("aborts a request with no answer after the timeout, as a network failure", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")));
        }),
    );
    const pending = failureOf(createHttpCounterClient(URL_ROOT, { fetch, timeoutMs: 500 }).read());
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ kind: "network" });
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates, and falls back when it can't", () => {
    const now = Date.UTC(2026, 9, 31, 12, 0, 0);
    expect(parseRetryAfter("3", now)).toBe(3000);
    expect(parseRetryAfter(new Date(now + 5000).toUTCString(), now)).toBe(5000);
    expect(parseRetryAfter(new Date(now - 5000).toUTCString(), now)).toBe(0);
    expect(parseRetryAfter(null, now)).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(parseRetryAfter("soon", now)).toBe(DEFAULT_RETRY_AFTER_MS);
  });
});
