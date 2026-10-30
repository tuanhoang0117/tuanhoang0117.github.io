# musty-counter

The shared click counter for the mustang mascot: a Cloudflare Worker in front of one SQLite-backed
Durable Object ([ADR 0004](../docs/decisions/0004-shared-mascot-counter.md), issue #97). It is a
separate npm package from the site; nothing here is part of the site build.

## API

| Request                                 | Response                              |
| --------------------------------------- | ------------------------------------- |
| `GET /count`                            | `200 { "count": n }`                  |
| `POST /increment` with `{ "by": 1-50 }` | `200 { "count": n }`, the new total   |
| Bad body or `Content-Type`              | `400 { "error": ... }`                |
| Increment without an allowed `Origin`   | `403`                                 |
| Too many requests                       | `429` with `Retry-After` (seconds)    |
| Unknown path / wrong method             | `404` / `405` with `Allow`            |
| Storage unavailable (e.g. over quota)   | `503`; the site keeps its local count |

CORS allows only `https://tuanhoang0117.github.io` (plus `http://localhost:<port>` when
`ALLOW_DEV_ORIGINS` is `"true"`, which only `npm run dev` sets). Every response has `Vary: Origin`
and never `Access-Control-Allow-Origin: *`. Origins are listed in [`src/cors.ts`](src/cors.ts).

Limits, all in [`src/limits.ts`](src/limits.ts):

- Each client gets a burst of 5 increments, then one every 3 seconds. A client is the IPv4
  address Cloudflare reports, or the /64 network for IPv6, stored only as a salted hash.
- At most 20,000 accepted increments per UTC day across everyone, which keeps storage writes under
  80,000 rows a day (the free tier allows 100,000). After that every increment gets a `429` until
  midnight UTC.

## Develop and test

```bash
cd worker
npm ci
npm test            # Vitest inside the Workers runtime (@cloudflare/vitest-plugin); no account needed
npm run typecheck   # generates runtime types from wrangler.jsonc, then runs tsc
npm run dev         # local server with a local Durable Object, localhost origins allowed
```

## Deploy (owner only)

Run these in a normal terminal, not inside Claude Code or Codex. Nothing here needs an account ID
or token in the repo: Wrangler signs in through the browser.

1. Install the pinned tools: `cd worker && npm ci`
2. Sign in: `npx wrangler login --use-keyring`. A browser window asks you to allow Wrangler access
   to your Cloudflare account. `--use-keyring` keeps the credential in macOS Keychain instead of a
   plain-text file. Check it with `npx wrangler whoami`.
3. Deploy: `npx wrangler deploy`. The first deploy creates the Worker and the `Counter` Durable
   Object (the `v1` migration in `wrangler.jsonc`). If your account has no `workers.dev`
   subdomain yet, Wrangler asks you to pick one; the URL below assumes `tuanhoang0117`. In the
   output, check that `env.ALLOW_DEV_ORIGINS` shows `("false")`.
4. The Worker is live at `https://musty-counter.tuanhoang0117.workers.dev`. Check it:

   ```bash
   curl https://musty-counter.tuanhoang0117.workers.dev/count
   # {"count":0}
   curl -i -X POST https://musty-counter.tuanhoang0117.workers.dev/increment \
     -H 'Content-Type: application/json' -d '{"by":1}'
   # HTTP 403: no Origin, so refused (this is correct)
   ```

## Watch usage

- **Requests and errors:** Cloudflare dashboard → **Workers & Pages** → `musty-counter` →
  **Metrics**. The free plan allows 100,000 Worker requests a day (resets at midnight UTC).
- **Durable Object usage:** dashboard → **Durable Objects** → the `Counter` namespace →
  **Metrics**, for requests, rows read and rows written (free plan: 100,000 rows written a day).
- **Live logs:** `npx wrangler tail` streams requests and `console.error` output.

On the free plan, going over a limit makes requests fail rather than adding a bill. The Worker
answers `503` when its storage fails and the site falls back to its local count.

## Roll back

```bash
npx wrangler deployments list   # recent deployments
npx wrangler versions list      # recent versions and their IDs
npx wrangler rollback           # back to the version before the current one
npx wrangler rollback <VERSION_ID>
```

Rollback swaps the code only; the stored count stays. Cloudflare refuses a rollback across a
Durable Object migration, so it can't go back past the first deploy. To take the counter offline
instead, set `"workers_dev": false` in `wrangler.jsonc` and deploy again (disabling it only in the
dashboard is undone by the next `wrangler deploy`).

## Read the count out (for a migration)

The count is public: `curl https://musty-counter.tuanhoang0117.workers.dev/count` returns the exact
total. Save that number before moving to another backend. Read it **before** any `wrangler delete`:
deleting the Worker deletes the Durable Object and its data. (It lives in the `counter` table of
the Durable Object named `mustang`.)
