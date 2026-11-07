import { DurableObject } from "cloudflare:workers";
import { clientKey } from "./client";
import {
  BUCKET_CAPACITY,
  BUCKET_IDLE_MS,
  DAILY_INCREMENT_LIMIT,
  PRUNE_INTERVAL_MS,
  REFILL_MS,
} from "./limits";

/** The single named Durable Object that holds the count. */
export const COUNTER_NAME = "mustang";

export type IncrementResult =
  | { ok: true; count: number }
  | { ok: false; reason: "rate_limited" | "daily_limit"; retryAfterSeconds: number };

type CounterRow = {
  count: number;
  day: string;
  day_increments: number;
  last_prune_ms: number;
};

type BucketRow = { tokens: number; updated_ms: number };

/**
 * The one shared counter. Requests to a Durable Object run one at a time, and every read and
 * write in `increment` happens synchronously after the only `await`, so no other request can
 * interleave between reading the count and writing it back.
 *
 * Storage: one `counter` row (the count, today's accepted increments, and a random salt), and one
 * `buckets` row per recent client. Clients (an IPv4 address or an IPv6 /64, see client.ts) are
 * stored as a salted SHA-256 hash, never the IP itself; the salt never leaves this object.
 */
export class Counter extends DurableObject<Env> {
  private readonly salt: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      count INTEGER NOT NULL,
      day TEXT NOT NULL,
      day_increments INTEGER NOT NULL,
      last_prune_ms INTEGER NOT NULL,
      salt TEXT NOT NULL
    )`);
    // WITHOUT ROWID keeps the primary key as the table itself, so an upsert writes one row
    // instead of a row plus an index entry.
    sql.exec(`CREATE TABLE IF NOT EXISTS buckets (
      client TEXT PRIMARY KEY,
      tokens REAL NOT NULL,
      updated_ms INTEGER NOT NULL
    ) WITHOUT ROWID`);
    sql.exec(
      "INSERT OR IGNORE INTO counter (id, count, day, day_increments, last_prune_ms, salt) VALUES (1, 0, '', 0, 0, ?)",
      randomHex(16),
    );
    this.salt = sql.exec<{ salt: string }>("SELECT salt FROM counter WHERE id = 1").one().salt;
  }

  getCount(): number {
    return this.ctx.storage.sql
      .exec<{ count: number }>("SELECT count FROM counter WHERE id = 1")
      .one().count;
  }

  async increment(by: number, clientIp: string): Promise<IncrementResult> {
    const client = await this.hashClient(clientIp);
    const now = Date.now();
    const sql = this.ctx.storage.sql;

    return this.ctx.storage.transactionSync((): IncrementResult => {
      const row = sql
        .exec<CounterRow>(
          "SELECT count, day, day_increments, last_prune_ms FROM counter WHERE id = 1",
        )
        .one();
      const today = utcDay(now);
      const dayIncrements = row.day === today ? row.day_increments : 0;
      if (dayIncrements >= DAILY_INCREMENT_LIMIT) {
        return { ok: false, reason: "daily_limit", retryAfterSeconds: secondsUntilNextUtcDay(now) };
      }

      const bucket = sql
        .exec<BucketRow>("SELECT tokens, updated_ms FROM buckets WHERE client = ?", client)
        .toArray()[0];
      const tokens = bucket
        ? Math.min(
            BUCKET_CAPACITY,
            bucket.tokens + Math.max(0, now - bucket.updated_ms) / REFILL_MS,
          )
        : BUCKET_CAPACITY;
      if (tokens < 1) {
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterSeconds: Math.max(1, Math.ceil(((1 - tokens) * REFILL_MS) / 1000)),
        };
      }

      sql.exec(
        `INSERT INTO buckets (client, tokens, updated_ms) VALUES (?, ?, ?)
         ON CONFLICT (client) DO UPDATE SET tokens = excluded.tokens, updated_ms = excluded.updated_ms`,
        client,
        tokens - 1,
        now,
      );

      const prune = now - row.last_prune_ms >= PRUNE_INTERVAL_MS;
      if (prune) {
        sql.exec("DELETE FROM buckets WHERE updated_ms <= ?", now - BUCKET_IDLE_MS);
      }

      const count = row.count + by;
      sql.exec(
        "UPDATE counter SET count = ?, day = ?, day_increments = ?, last_prune_ms = ? WHERE id = 1",
        count,
        today,
        dayIncrements + 1,
        prune ? now : row.last_prune_ms,
      );
      return { ok: true, count };
    });
  }

  private async hashClient(ip: string): Promise<string> {
    const data = new TextEncoder().encode(`${this.salt}|${clientKey(ip)}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toHex(new Uint8Array(digest).slice(0, 16));
  }
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(ms: number): number {
  const next = new Date(ms);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - ms) / 1000));
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
