import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { BASE, SITE, freshIp, increment, readCount } from "./helpers";

// Storage is shared by every test in this file, so count checks compare before and after.

/**
 * Calls the Worker's handler directly, to test with a modified env. The cast gives the request
 * the incoming-request type the handler expects, as Cloudflare's testing guide does.
 */
function callWith(testEnv: Env, request: Request): Promise<Response> {
  return worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, testEnv);
}

describe("GET /count", () => {
  it("returns the count as JSON with CORS for the site", async () => {
    const response = await exports.default.fetch(`${BASE}/count`, { headers: { Origin: SITE } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(response.headers.get("Vary")).toBe("Origin");
    const data = await response.json<{ count: number }>();
    expect(Object.keys(data)).toEqual(["count"]);
    expect(Number.isInteger(data.count)).toBe(true);
  });

  it("answers without an Origin (curl) but sends no CORS header", async () => {
    const response = await exports.default.fetch(`${BASE}/count`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
    await response.json();
  });
});

describe("POST /increment", () => {
  it("adds `by` and returns the new count, which GET then reads", async () => {
    const before = await readCount();
    const response = await increment(7);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(await response.json()).toEqual({ count: before + 7 });
    expect(await readCount()).toBe(before + 7);
  });

  it("accepts both ends of the range and a charset on the content type", async () => {
    const before = await readCount();
    expect((await increment(1)).status).toBe(200);
    const response = await increment(50, { contentType: "application/json; charset=utf-8" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: before + 51 });
  });

  it("loses no increments when many requests arrive at once", async () => {
    const before = await readCount();
    const amounts = Array.from({ length: 120 }, (_, i) => (i % 50) + 1);
    const responses = await Promise.all(amounts.map((by) => increment(by)));
    const bodies = await Promise.all(responses.map((r) => r.json<{ count: number }>()));

    expect(responses.map((r) => r.status)).toEqual(amounts.map(() => 200));
    const total = amounts.reduce((sum, by) => sum + by, 0);
    expect(await readCount()).toBe(before + total);
    // Each request saw a different running total, so none overwrote another.
    expect(new Set(bodies.map((b) => b.count)).size).toBe(amounts.length);
  });

  const badBodies: [string, Parameters<typeof increment>][] = [
    ["a non-integer", [1.5]],
    ["zero", [0]],
    ["51", [51]],
    ["a negative number", [-3]],
    ["a numeric string", ["5"]],
    ["null", [null]],
    ["a missing body", [1, { body: null }]],
    ["an empty body", [1, { body: "" }]],
    ["an empty object", [1, { body: "{}" }]],
    ["an extra key", [1, { body: '{"by":1,"also":2}' }]],
    ["an array", [1, { body: "[1]" }]],
    ["invalid JSON", [1, { body: "{by:1}" }]],
    ["a text/plain content type", [1, { contentType: "text/plain" }]],
    ["a form content type", [1, { contentType: "application/x-www-form-urlencoded" }]],
    ["no content type", [1, { contentType: null }]],
    // Valid JSON padded past the size cap, so only the cap can reject it.
    ["an oversized body", [1, { body: `{"by":1}${" ".repeat(400)}` }]],
  ];

  it.each(badBodies)("rejects %s with 400 and leaves the count alone", async (_, args) => {
    const before = await readCount();
    const response = await increment(...args);
    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(await response.json()).toHaveProperty("error");
    expect(await readCount()).toBe(before);
  });
});

describe("origin checks", () => {
  const badOrigins: [string, string | null][] = [
    ["a missing Origin", null],
    ["another site", "https://evil.example"],
    ["a lookalike domain", "https://tuanhoang0117.github.io.evil.example"],
    ["the site over http", "http://tuanhoang0117.github.io"],
    ["a trailing slash", "https://tuanhoang0117.github.io/"],
    ["an opaque origin", "null"],
    ["localhost (dev origins are off in the deployed config)", "http://localhost:5173"],
  ];

  it.each(badOrigins)("refuses increments from %s with 403", async (_, origin) => {
    const before = await readCount();
    const response = await increment(1, { origin });
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
    await response.json();
    expect(await readCount()).toBe(before);
  });

  it("sends no CORS header to another origin on a read", async () => {
    const response = await exports.default.fetch(`${BASE}/count`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
    await response.json();
  });

  it("ships with dev origins off", () => {
    expect(env.ALLOW_DEV_ORIGINS).toBe("false");
  });

  it("allows localhost only when ALLOW_DEV_ORIGINS is true", async () => {
    const devEnv: Env = { ...env, ALLOW_DEV_ORIGINS: "true", COUNTER: env.COUNTER };
    const make = (origin: string) =>
      new Request(`${BASE}/increment`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "CF-Connecting-IP": freshIp(),
        },
        body: JSON.stringify({ by: 1 }),
      });

    const local = await callWith(devEnv, make("http://localhost:5173"));
    expect(local.status).toBe(200);
    expect(local.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    await local.json();

    for (const origin of [
      "https://localhost:5173",
      "http://localhost",
      "http://localhost.evil:1",
    ]) {
      const response = await callWith(devEnv, make(origin));
      expect(response.status, origin).toBe(403);
      await response.json();
    }
  });

  it("never answers with a wildcard origin", async () => {
    const responses = [
      await exports.default.fetch(`${BASE}/count`, { headers: { Origin: SITE } }),
      await exports.default.fetch(`${BASE}/count`, { headers: { Origin: "https://evil.example" } }),
      await increment(1),
      await increment(1, { origin: "https://evil.example" }),
      await exports.default.fetch(`${BASE}/increment`, {
        method: "OPTIONS",
        headers: { Origin: SITE, "Access-Control-Request-Method": "POST" },
      }),
    ];
    for (const response of responses) {
      expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
      await response.text();
    }
  });
});

describe("preflight", () => {
  it("approves a POST with a JSON body from the site", async () => {
    const response = await exports.default.fetch(`${BASE}/increment`, {
      method: "OPTIONS",
      headers: {
        Origin: SITE,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(await response.text()).toBe("");
  });

  it("refuses a preflight from another origin", async () => {
    const response = await exports.default.fetch(`${BASE}/increment`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull();
    await response.text();
  });
});

describe("routing", () => {
  it.each([
    ["GET", "/increment", "POST, OPTIONS"],
    ["POST", "/count", "GET, OPTIONS"],
    ["DELETE", "/count", "GET, OPTIONS"],
    ["PUT", "/increment", "POST, OPTIONS"],
  ])("answers %s %s with 405", async (method, path, allow) => {
    const response = await exports.default.fetch(`${BASE}${path}`, {
      method,
      headers: { Origin: SITE },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe(allow);
    await response.json();
  });

  it.each(["/", "/count/", "/reset", "/increment/extra"])("answers %s with 404", async (path) => {
    const response = await exports.default.fetch(`${BASE}${path}`, { headers: { Origin: SITE } });
    expect(response.status).toBe(404);
    expect(response.headers.get("Vary")).toBe("Origin");
    await response.json();
  });

  it("answers 503 when the Durable Object fails", async () => {
    const failing = {
      getByName: () => ({
        getCount: () => Promise.reject(new Error("quota exceeded")),
      }),
    } as unknown as Env["COUNTER"];
    const response = await callWith(
      { ...env, COUNTER: failing },
      new Request(`${BASE}/count`, { headers: { Origin: SITE } }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
