import { exports } from "cloudflare:workers";

export const SITE = "https://tuanhoang0117.github.io";
export const BASE = "https://musty-counter.example";

let nextClient = 0;

/**
 * A client no other test has used, so earlier requests can't have drained its bucket. Each one is
 * in its own IPv6 /64, because the rate limit treats a whole /64 as one client.
 */
export function freshIp(): string {
  nextClient += 1;
  return `2001:db8:0:${nextClient.toString(16)}::1`;
}

type IncrementOptions = {
  origin?: string | null;
  ip?: string;
  contentType?: string | null;
  body?: string | null;
};

/** POST /increment through the Worker, as a browser on the site would send it by default. */
export function increment(by: unknown, options: IncrementOptions = {}): Promise<Response> {
  const headers = new Headers();
  const origin = options.origin === undefined ? SITE : options.origin;
  if (origin !== null) headers.set("Origin", origin);
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (contentType !== null) headers.set("Content-Type", contentType);
  headers.set("CF-Connecting-IP", options.ip ?? freshIp());
  const body = options.body === undefined ? JSON.stringify({ by }) : options.body;
  return exports.default.fetch(`${BASE}/increment`, {
    method: "POST",
    headers,
    body: body ?? undefined,
  });
}

/** GET /count through the Worker and return the number. */
export async function readCount(): Promise<number> {
  const response = await exports.default.fetch(`${BASE}/count`, { headers: { Origin: SITE } });
  const data = await response.json<{ count: number }>();
  return data.count;
}
