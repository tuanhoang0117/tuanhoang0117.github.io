/**
 * Talks to the shared mascot counter (worker/README.md): `GET /count` and
 * `POST /increment { by }`, both answering `{ count }`. The local client keeps the same shape so
 * the rest of the site never has to know which one it got.
 */
export interface CounterClient {
  readonly kind: "http" | "local";
  /** The current total. */
  read(): Promise<number>;
  /**
   * Adds `by` and resolves with the new total. `keepalive` lets the request outlive the page, for
   * presses sent as it goes away.
   */
  increment(by: number, options?: { keepalive?: boolean }): Promise<number>;
}

/**
 * Why a request failed. The difference that matters is whether the server could have counted it:
 * - `network`: no answer (offline, refused, timed out, or a body that stopped partway). The request
 *   may or may not have arrived.
 * - `rate-limited`: a 429. Not counted; try again after `retryAfterMs`.
 * - `rejected`: any other error status, which the Worker never counts. `retryable` for 5xx, not
 *   for 4xx (a 403 or 400 will never start working on its own). A 200 whose body has no count is
 *   also `rejected`, not retryable, so the increment it did make is never sent again.
 */
export type CounterFailure =
  | { kind: "network" }
  | { kind: "rate-limited"; retryAfterMs: number }
  | { kind: "rejected"; status: number; retryable: boolean };

export class CounterError extends Error {
  readonly failure: CounterFailure;
  constructor(failure: CounterFailure) {
    super(`Counter request failed: ${failure.kind}`);
    this.name = "CounterError";
    this.failure = failure;
  }
}

/** A 429 without a usable Retry-After waits this long: one token of the Worker's 3 s refill. */
export const DEFAULT_RETRY_AFTER_MS = 3000;

/** Reads `Retry-After` as seconds or an HTTP date, in milliseconds from `now`. */
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (value === null || value.trim() === "") return DEFAULT_RETRY_AFTER_MS;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return DEFAULT_RETRY_AFTER_MS;
  return Math.max(0, date - now);
}

export interface HttpCounterOptions {
  fetch?: typeof fetch;
  /**
   * A request whose whole answer, body included, hasn't arrived by then is aborted and treated as a
   * network failure.
   */
  timeoutMs?: number;
}

export function createHttpCounterClient(
  baseUrl: string,
  {
    fetch: fetchImpl = (...args) => globalThis.fetch(...args),
    timeoutMs = 10_000,
  }: HttpCounterOptions = {},
): CounterClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(path: string, init: RequestInit): Promise<number> {
    const controller = new AbortController();
    // Settles when the timer fires, so a stalled body can't outlast the timeout even if the fetch in
    // use doesn't tie the body to the signal.
    const timedOut = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("timeout")));
    });
    timedOut.catch(() => {});
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await Promise.race([
          fetchImpl(`${root}${path}`, { ...init, signal: controller.signal }),
          timedOut,
        ]);
      } catch {
        throw new CounterError({ kind: "network" });
      }
      if (response.status === 429) {
        throw new CounterError({
          kind: "rate-limited",
          retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
        });
      }
      if (!response.ok) {
        throw new CounterError({
          kind: "rejected",
          status: response.status,
          retryable: response.status >= 500,
        });
      }
      let text: string;
      try {
        text = await Promise.race([response.text(), timedOut]);
      } catch {
        // The answer stopped partway (stalled or cut off): no answer, so not a bad one either.
        response.body?.cancel().catch(() => {});
        throw new CounterError({ kind: "network" });
      }
      const count = countIn(text);
      if (count === undefined) {
        // The server answered 200, so an increment did land; only the new total is unknown.
        throw new CounterError({ kind: "rejected", status: response.status, retryable: false });
      }
      return count;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    kind: "http",
    read: () => request("/count", { method: "GET" }),
    increment: (by, { keepalive = false } = {}) =>
      request("/increment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by }),
        keepalive,
      }),
  };
}

/** The finite `count` in a JSON body, or undefined. */
function countIn(text: string): number | undefined {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  const count = (body as { count?: unknown } | null)?.count;
  return typeof count === "number" && Number.isFinite(count) ? count : undefined;
}

/** Counts on this page only, starting at 0: the site's behavior with no endpoint configured. */
export function createLocalCounterClient(): CounterClient {
  let count = 0;
  return {
    kind: "local",
    read: async () => count,
    increment: async (by) => (count += by),
  };
}

/**
 * The client for this build. `VITE_COUNTER_URL` is a public, build-time value (`.env.production`);
 * without one, as in `npm run dev` and unit tests, the site counts locally.
 */
export function counterClientFromEnv(
  env: { VITE_COUNTER_URL?: string } = import.meta.env,
): CounterClient {
  const url = env.VITE_COUNTER_URL?.trim();
  return url ? createHttpCounterClient(url) : createLocalCounterClient();
}
