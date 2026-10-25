# 0004. Shared mascot counter backend

- **Status:** Accepted (2026-10-25)
- **Date:** 2026-10-24
- **Decision owner:** Tuan Hoang

## Context

The portfolio is a static GitHub Pages site, but the mustang's click count should be shared by all
visitors. The browser therefore needs a small public API that can atomically read and increment one
counter without exposing an administrative credential.

This is a public novelty counter, not an authentication boundary. An origin allowlist stops other
websites from calling the API through a visitor's browser, but non-browser clients can forge an
`Origin` header. Every option still needs server-side rate limiting, input validation, and a hard
usage ceiling. The site should keep its local fallback when the service is unavailable or over
quota.

The limits below are vendor-published limits as of 2026-10-24. They can change, so they should be
rechecked before implementation.

## Requirements

- One atomic shared counter with read and increment operations.
- An explicit CORS allowlist for the production GitHub Pages origin and any later custom domain.
  Development origins are enabled only outside production.
- Reject state-changing requests whose `Origin` is missing or not allowlisted. Return
  `Vary: Origin`; never return `Access-Control-Allow-Origin: *`.
- Rate-limit increments by a server-observed client identifier. CORS is not the abuse control.
- Keep database credentials and administrative keys in the backend. The browser receives only the
  endpoint URL and, where applicable, a vendor-defined publishable identifier.
- Stay inside a no-cost tier for normal portfolio traffic and fail closed before surprise spend.
- Keep setup, deployment, monitoring, and recovery small enough for one maintainer.

## Options

### Cloudflare Workers with Workers KV

The free Workers plan allows
[100,000 requests per day](https://developers.cloudflare.com/workers/platform/limits/). KV adds
[100,000 reads and 1,000 writes per day, 1 GB storage, and one write per second to the same key](https://developers.cloudflare.com/kv/platform/limits/).
A Worker can compare the request origin with an exact allowlist, return the matching CORS header,
and use Cloudflare's
[Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
with a server-derived client key. That rate limiter is approximate and scoped by Cloudflare
location, which is acceptable as an outer abuse brake but not as a correctness mechanism.

KV is the problem for this workload. It is eventually consistent, concurrent writes to one key can
overwrite each other, and changes can take up to 60 seconds to appear elsewhere. Cloudflare
explicitly says KV is not suitable for atomic read-modify-write operations and recommends Durable
Objects when stronger consistency is required
([KV write guidance](https://developers.cloudflare.com/kv/api/write-key-value-pairs/),
[how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)). Batching clicks
reduces writes but cannot prevent lost increments from concurrent visitors.

Tuan would create a Cloudflare account, install Wrangler, create a KV namespace, bind it to a
Worker, configure the rate-limit binding and origin list, deploy, and monitor Worker/KV usage. The
KV binding is server-side, so no storage credential belongs in the browser. This is inexpensive
and operationally small, but it does not meet the atomic-counter requirement.

### Supabase Edge Function with Postgres

The Supabase free plan includes two projects, a 500 MB database, 5 GB egress, and
[500,000 Edge Function invocations](https://supabase.com/docs/guides/platform/billing-on-supabase).
An Edge Function can call a Postgres function that performs an atomic increment and returns the
new value in one transaction. It can implement an exact origin allowlist and preflight handling;
Supabase documents both
[manual and automatic CORS handling](https://supabase.com/docs/guides/functions/cors).

The database password and service-role key remain in
[Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), never in the browser.
Supabase's publishable key is designed to be public only when Row Level Security is correct; this
design should expose the Edge Function rather than direct table writes.

Supabase does not provide a turnkey per-client limiter for this public function. Its official
[rate-limiting example](https://supabase.com/docs/guides/functions/examples/rate-limiting) adds
Upstash Redis, which means another account and quota. A Postgres token-bucket table is possible,
but it adds cleanup and database traffic. Free projects with low activity can also be
[paused after a seven-day period](https://supabase.com/docs/guides/platform/free-project-pausing),
so the counter may cold-fail until Tuan restores it.

Tuan would create a Supabase project, define the counter and atomic SQL function, deploy an Edge
Function, set secrets and allowed origins, add either a Postgres or Upstash limiter, monitor
function/database usage, and restore or upgrade a paused project. This option has familiar SQL and
correct atomic updates, but the rate limiter and free-project pausing increase maintenance.

### Firebase HTTP Function with Cloud Firestore

Cloud Firestore's free quota is
[1 GiB storage, 50,000 reads, and 20,000 writes per day](https://firebase.google.com/docs/firestore/quotas).
An HTTP Cloud Function can use a Firestore transaction for an atomic increment. Firebase HTTP
functions accept an explicit string, regular expression, or array
[CORS allowlist](https://firebase.google.com/docs/functions/http-events). Admin access stays in the
function runtime; the browser does not receive a service-account secret.

Production Cloud Functions require the
[Blaze pay-as-you-go plan](https://firebase.google.com/docs/functions/get-started), even when usage
fits the no-cost allowance. Firebase therefore recommends budget alerts and Cloud Run maximum
instance limits
([Functions quotas](https://firebase.google.com/docs/functions/quotas)). Firestore quotas are
ample for a portfolio, but a bot can spend them quickly. Firebase App Check with reCAPTCHA
Enterprise can attest that web requests came from the site
([App Check setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)),
but it is an additional browser integration and is still complementary to per-client rate
limiting.

Tuan would create a Firebase/Google Cloud project, attach billing, initialize Firestore and
Functions, configure CORS, add a transaction and rate-limit store, configure App Check, deploy
with the Firebase CLI, and maintain budget alerts, instance caps, rules, indexes, and logs. It is
robust and well documented, but has the largest setup surface and the only required billing
account.

### Cloudflare Worker with a SQLite-backed Durable Object

This is a refinement of the Cloudflare option that replaces KV. Durable Objects are available on
the Workers free plan with SQLite storage. The free tier includes
[100,000 Durable Object requests per day](https://developers.cloudflare.com/durable-objects/platform/pricing/)
in addition to the Worker request limit. A named Durable Object is a single coordination point
with transactional, strongly consistent storage
([Durable Object model](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)).
That makes one atomic counter its natural workload.

The Worker remains the public boundary: it checks the exact origin allowlist, handles preflight,
derives a rate-limit key from Cloudflare's connection metadata, rejects abusive increments, and
forwards accepted operations to one named Durable Object. The object serializes increments and
can enforce a second, strict per-client token bucket. No secret is needed in the browser; the
Durable Object binding is available only inside the Worker.

Tuan would create one Cloudflare account, install Wrangler, define the Worker and SQLite-backed
Durable Object binding/migration, configure allowed origins and rate limits, deploy, and watch the
Workers analytics and daily quotas. There is one vendor and no billing account is required for
the proposed free deployment. The tradeoff is learning Cloudflare's Worker and Durable Object
deployment model.

## Comparison

| Option                  | Atomic shared increment                    | Free-tier fit                                     | Abuse controls                                             | Operational cost                 |
| ----------------------- | ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| Workers + KV            | No; concurrent increments can be lost      | Good quotas, but one write/second per counter key | Worker CORS and approximate rate-limit binding             | Low, but incorrect storage model |
| Supabase                | Yes, with one Postgres transaction         | Good quotas; low-activity projects may pause      | Function allowlist plus custom Postgres or Upstash limiter | Medium; possibly two services    |
| Firebase                | Yes, with a Firestore transaction          | Good quotas, but Functions require Blaze billing  | Function allowlist, App Check, and a custom limiter        | Highest                          |
| Worker + Durable Object | Yes; requests to one object are serialized | 100,000 Worker and object requests/day            | Worker allowlist plus edge and strict object limits        | Low; one account and toolchain   |

## Proposed decision

Use a **Cloudflare Worker with one SQLite-backed Durable Object**, not Workers KV.

It gives the counter the strong consistency KV lacks, keeps the public endpoint, rate limiting,
state, and deployment in one free platform, and requires no secret in the browser. The
implementation should:

1. expose only read and batched-increment operations;
2. allow only the site's explicit production origins and reject other or absent origins for
   increments;
3. apply an outer Worker rate limit and a strict per-client limit in the Durable Object;
4. cap each request's increment amount and return `429` with retry guidance when limited;
5. keep the client-side local fallback required by issue #29; and
6. document Wrangler login, Durable Object migration, deployment, quota monitoring, and rollback.

## Decision

Tuan chose the Cloudflare option on 2026-10-25, and the lead recorded it as the **Worker with one
SQLite-backed Durable Object**, not Workers KV: KV cannot do the atomic increment the requirements
call for (see the options above). He did not give a separate reason beyond choosing Cloudflare; the
rationale is the one in "Proposed decision" (strong consistency for one counter, one free platform,
no secret in the browser, one account to maintain).

Before any build starts, recheck the vendor limits quoted above (they were published values as of
2026-10-24), and write down the setup steps Tuan must do himself (Cloudflare account, `wrangler
login`, deploy) in the build issue (#29). No token is committed or printed.

## Consequences

- Correct increments do not depend on an eventually consistent cache.
- Normal portfolio traffic should remain within the free Worker and Durable Object quotas.
- Origin checks improve browser isolation but do not authenticate callers; rate limits and hard
  input caps remain mandatory.
- The counter depends on Cloudflare availability and a Cloudflare account Tuan must retain.
- A future migration needs a way to export the single count from Durable Object storage.
