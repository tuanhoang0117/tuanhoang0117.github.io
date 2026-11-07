import { parseIncrement } from "./body";
import { COUNTER_NAME, Counter } from "./counter";
import { allowedOrigin, baseHeaders } from "./cors";

// The main module may export only handlers and Durable Object classes; workerd refuses to start
// if it exports anything else (test/exports.test.ts checks this).
export { Counter };

/** Each path accepts one method (plus OPTIONS for CORS preflight). */
const ROUTES: Record<string, "GET" | "POST"> = {
  "/count": "GET",
  "/increment": "POST",
};

export default {
  async fetch(request, env): Promise<Response> {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    const method = ROUTES[new URL(request.url).pathname];

    if (method === undefined) return json({ error: "not_found" }, 404, origin);

    if (request.method === "OPTIONS") {
      if (origin === null) return json({ error: "forbidden_origin" }, 403, null);
      const headers = baseHeaders(origin);
      headers.set("Access-Control-Allow-Methods", `${method}, OPTIONS`);
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", "86400");
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== method) {
      return json({ error: "method_not_allowed" }, 405, origin, { Allow: `${method}, OPTIONS` });
    }

    try {
      const counter = env.COUNTER.getByName(COUNTER_NAME);

      if (method === "GET") {
        return json({ count: await counter.getCount() }, 200, origin);
      }

      // Reads are public; changing the count needs a browser on an allowed origin. Non-browser
      // clients can forge Origin, which is why the Durable Object also rate-limits (ADR 0004).
      if (origin === null) return json({ error: "forbidden_origin" }, 403, null);

      const parsed = await parseIncrement(request);
      if (!parsed.ok) return json({ error: parsed.error }, 400, origin);

      // Cloudflare always sets CF-Connecting-IP in production; it is only missing in local tools.
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const result = await counter.increment(parsed.by, ip);
      if (!result.ok) {
        return json({ error: result.reason }, 429, origin, {
          "Retry-After": String(result.retryAfterSeconds),
        });
      }
      return json({ count: result.count }, 200, origin);
    } catch (error) {
      // Storage errors (including a Cloudflare quota being hit) leave the site on its local
      // fallback rather than showing a broken count.
      console.error("counter unavailable", error);
      return json({ error: "unavailable" }, 503, origin);
    }
  },
} satisfies ExportedHandler<Env>;

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  const headers = baseHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}
