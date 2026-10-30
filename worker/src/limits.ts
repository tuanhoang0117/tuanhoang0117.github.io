// Abuse limits for the counter. Free-tier numbers they protect (rechecked 2026-10-30, issue #97):
// Workers 100,000 requests/day; Durable Objects 100,000 requests and 100,000 rows written/day.

/** Largest batch one POST /increment may add. */
export const MAX_INCREMENT = 50;

/**
 * Accepted increments per UTC day across all clients. Each accepted increment writes two rows
 * (the counter row and the client's bucket row); rejected requests write nothing. Pruning deletes
 * each bucket at most once (a delete counts as a row written), and only accepted increments
 * create buckets. Worst case for one day: 40,000 rows from increments, plus deleting up to 20,000
 * of today's buckets and up to 20,000 left over from yesterday's last hour = 80,000 rows written,
 * under the 100,000 free-tier limit. A normal day is far below this.
 */
export const DAILY_INCREMENT_LIMIT = 20_000;

/** Per-client token bucket: a burst of BUCKET_CAPACITY requests, then one every REFILL_MS. */
export const BUCKET_CAPACITY = 5;
export const REFILL_MS = 3_000;

/** A bucket untouched this long is full again, so deleting it changes nothing. */
export const BUCKET_IDLE_MS = BUCKET_CAPACITY * REFILL_MS;

/** How often an increment also deletes idle buckets. */
export const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/** Largest request body read for POST /increment. `{"by":50}` is 9 bytes. */
export const MAX_BODY_BYTES = 256;
