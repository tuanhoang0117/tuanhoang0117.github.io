/** Exact origins allowed in production. Add a custom domain here if the site gets one. */
export const PRODUCTION_ORIGINS: readonly string[] = ["https://tuanhoang0117.github.io"];

const DEV_ORIGIN = /^http:\/\/localhost:\d{1,5}$/;

/**
 * Returns the origin if the browser may call the API from it, otherwise null. Localhost origins
 * count only when ALLOW_DEV_ORIGINS is exactly "true" (set by `npm run dev`, never deployed).
 */
export function allowedOrigin(
  origin: string | null,
  env: Pick<Env, "ALLOW_DEV_ORIGINS">,
): string | null {
  if (origin === null) return null;
  if (PRODUCTION_ORIGINS.includes(origin)) return origin;
  if (env.ALLOW_DEV_ORIGINS === "true" && DEV_ORIGIN.test(origin)) return origin;
  return null;
}

/** Headers every response carries. CORS headers only appear for an allowed origin. */
export function baseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  if (origin !== null) {
    headers.set("Access-Control-Allow-Origin", origin);
    // Lets the site read how long to back off after a 429.
    headers.set("Access-Control-Expose-Headers", "Retry-After");
  }
  return headers;
}
