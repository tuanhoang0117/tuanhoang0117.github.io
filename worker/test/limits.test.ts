import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { COUNTER_NAME } from "../src/counter";
import {
  BUCKET_CAPACITY,
  BUCKET_IDLE_MS,
  DAILY_INCREMENT_LIMIT,
  PRUNE_INTERVAL_MS,
  REFILL_MS,
} from "../src/limits";
import { SITE, freshIp, increment, readCount } from "./helpers";

// Storage is shared by every test in this file, so each test uses its own client IPs and puts
// back any limit it changes.

function sql<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: unknown[]) {
  return runInDurableObject(env.COUNTER.getByName(COUNTER_NAME), (_, state) =>
    state.storage.sql.exec<T>(query, ...bindings).toArray(),
  );
}

const today = () => new Date().toISOString().slice(0, 10);

describe("per-client rate limit", () => {
  it(`allows a burst of ${BUCKET_CAPACITY}, then answers 429 with Retry-After`, async () => {
    const ip = freshIp();
    for (let i = 0; i < BUCKET_CAPACITY; i += 1) {
      const ok = await increment(1, { ip });
      expect(ok.status).toBe(200);
      await ok.json();
    }
    const before = await readCount();

    const limited = await increment(1, { ip });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    const retryAfter = Number(limited.headers.get("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(Math.ceil(REFILL_MS / 1000));
    // The site must be able to read Retry-After across origins.
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(limited.headers.get("Access-Control-Expose-Headers")).toContain("Retry-After");
    expect(await readCount()).toBe(before);

    // Another client is unaffected.
    const other = await increment(1);
    expect(other.status).toBe(200);
    await other.json();
  });

  it("refills one request per REFILL_MS", async () => {
    const ip = freshIp();
    for (let i = 0; i < BUCKET_CAPACITY; i += 1) await (await increment(1, { ip })).json();
    const limited = await increment(1, { ip });
    expect(limited.status).toBe(429);
    await limited.json();

    // Age every bucket by one refill period instead of waiting for it.
    await sql("UPDATE buckets SET updated_ms = updated_ms - ?", REFILL_MS);
    const refilled = await increment(1, { ip });
    expect(refilled.status).toBe(200);
    await refilled.json();
    const again = await increment(1, { ip });
    expect(again.status).toBe(429);
    await again.json();
  });

  it("stores a salted hash of the client, never the IP", async () => {
    const ip = "198.51.100.77";
    await (await increment(1, { ip })).json();
    const dump = JSON.stringify([
      await sql("SELECT * FROM buckets"),
      await sql("SELECT * FROM counter"),
    ]);
    expect(dump).not.toContain(ip);
    const clients = await sql<{ client: string }>("SELECT client FROM buckets");
    for (const { client } of clients) expect(client).toMatch(/^[0-9a-f]{32}$/);
  });

  it("prunes buckets that have been idle long enough to be full again", async () => {
    const idleIp = freshIp();
    const recentIp = freshIp();
    await (await increment(1, { ip: idleIp })).json();
    const idleClient = (
      await sql<{ client: string }>("SELECT client FROM buckets ORDER BY updated_ms DESC LIMIT 1")
    )[0].client;
    await sql(
      "UPDATE buckets SET updated_ms = updated_ms - ? WHERE client = ?",
      BUCKET_IDLE_MS + 1000,
      idleClient,
    );
    await (await increment(1, { ip: recentIp })).json();
    const recentClient = (
      await sql<{ client: string }>("SELECT client FROM buckets ORDER BY updated_ms DESC LIMIT 1")
    )[0].client;

    // Not yet time to prune: the idle bucket stays.
    await (await increment(1)).json();
    expect(await sql("SELECT 1 FROM buckets WHERE client = ?", idleClient)).toHaveLength(1);

    await sql("UPDATE counter SET last_prune_ms = last_prune_ms - ?", PRUNE_INTERVAL_MS);
    await (await increment(1)).json();
    expect(await sql("SELECT 1 FROM buckets WHERE client = ?", idleClient)).toHaveLength(0);
    expect(await sql("SELECT 1 FROM buckets WHERE client = ?", recentClient)).toHaveLength(1);
  });
});

describe("daily ceiling", () => {
  it("is well under the free tier's 100,000 rows written per day", () => {
    // Two rows per accepted increment plus at most two bucket deletes (see limits.ts).
    expect(DAILY_INCREMENT_LIMIT * 4).toBeLessThan(100_000);
  });

  it("answers 429 for every client once the day's increments are used up", async () => {
    const [{ day_increments: saved }] = await sql<{ day_increments: number }>(
      "SELECT day_increments FROM counter",
    );
    await sql("UPDATE counter SET day = ?, day_increments = ?", today(), DAILY_INCREMENT_LIMIT - 1);
    const before = await readCount();

    const last = await increment(2);
    expect(last.status).toBe(200);
    expect(await last.json()).toEqual({ count: before + 2 });

    const over = await increment(2, { ip: freshIp() });
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "daily_limit" });
    const retryAfter = Number(over.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(86_400);
    expect(await readCount()).toBe(before + 2);

    await sql("UPDATE counter SET day_increments = ?", saved);
  });

  it("starts a fresh allowance on a new UTC day", async () => {
    await sql(
      "UPDATE counter SET day = ?, day_increments = ?",
      "2000-01-01",
      DAILY_INCREMENT_LIMIT,
    );
    const response = await increment(1);
    expect(response.status).toBe(200);
    await response.json();
    const [row] = await sql<{ day: string; day_increments: number }>(
      "SELECT day, day_increments FROM counter",
    );
    expect(row).toEqual({ day: today(), day_increments: 1 });
  });
});
