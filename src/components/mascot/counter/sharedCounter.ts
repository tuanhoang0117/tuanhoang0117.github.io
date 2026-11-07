import { CounterError, type CounterClient, type CounterFailure } from "./client";

export interface SharedCounterOptions {
  /** Presses wait this long and go out together as one increment. */
  flushMs?: number;
  /** The most one increment may carry (the Worker accepts `by` from 1 to 50). */
  maxBatch?: number;
  /** The wait after the first failure; it doubles after each further one. */
  backoffMs?: number;
  /** After this many failures in a row, the counter stops calling the service and counts locally. */
  maxFailures?: number;
  /** A 429 asking for a longer wait than this (the daily cap) also switches to local counting. */
  maxRetryAfterMs?: number;
}

export type CounterMode = "shared" | "local";

const MAX_BACKOFF_MS = 30_000;

/**
 * The shared total as this visitor sees it, with presses batched, retried, and counted locally
 * when the service is down.
 *
 * What is shown is `base + unsent + inFlight + local`:
 * - `base`: the last total the server reported (0 until it reports one).
 * - `unsent`: presses not sent yet, or sent and refused (429, 5xx), which the server never counted.
 * - `inFlight`: presses in the one request currently out.
 * - `local`: presses that will never be sent: counted while in local mode, or sent in a request that
 *   got no answer at all.
 *
 * A press moves the total by one at once. A request only ever carries presses from `unsent`, so a
 * press is sent again only after the server said it wasn't counted. A request with no answer
 * (network error, timeout) may have been counted, so its presses are not sent again: the shared
 * total can miss them but never counts them twice.
 */
export class SharedCounter {
  private readonly client: CounterClient;
  private readonly flushMs: number;
  private readonly maxBatch: number;
  private readonly backoffMs: number;
  private readonly maxFailures: number;
  private readonly maxRetryAfterMs: number;

  private base = 0;
  private unsent = 0;
  private inFlight = 0;
  private local = 0;
  /** Presses from unanswered requests, until the next answer shows whether they landed. */
  private uncertain = 0;
  private synced = false;
  private busy = false;
  private failures = 0;
  private connected = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private mode: CounterMode = "shared";
  private count = 0;
  private readonly listeners = new Set<() => void>();

  constructor(client: CounterClient, options: SharedCounterOptions = {}) {
    this.client = client;
    this.flushMs = options.flushMs ?? 1000;
    this.maxBatch = options.maxBatch ?? 50;
    this.backoffMs = options.backoffMs ?? 1000;
    this.maxFailures = options.maxFailures ?? 4;
    this.maxRetryAfterMs = options.maxRetryAfterMs ?? 60_000;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getCount = () => this.count;

  getMode = () => this.mode;

  /** Starts talking to the service: reads the total, then sends presses as they come. */
  connect() {
    if (this.connected) return;
    this.connected = true;
    if (this.busy || this.timer !== undefined || this.mode === "local") return;
    if (!this.synced) void this.send();
    else if (this.unsent > 0) this.schedule(this.flushMs);
  }

  /** Stops timers and sends any waiting presses once, without retrying (the page is going away). */
  disconnect() {
    this.connected = false;
    this.clearTimer();
    if (this.mode === "shared" && !this.busy && this.unsent > 0) void this.send();
  }

  press() {
    if (this.mode === "local") this.local += 1;
    else this.unsent += 1;
    this.update();
    if (this.connected && this.mode === "shared" && !this.busy && this.timer === undefined) {
      this.schedule(this.flushMs);
    }
  }

  private async send() {
    const by = Math.min(this.unsent, this.maxBatch);
    this.busy = true;
    this.unsent -= by;
    this.inFlight = by;
    let retryIn: number | undefined;
    try {
      const total = by > 0 ? await this.client.increment(by) : await this.client.read();
      this.succeeded(total, by);
    } catch (error) {
      const failure: CounterFailure =
        error instanceof CounterError ? error.failure : { kind: "network" };
      retryIn = this.failed(failure, by);
    } finally {
      this.busy = false;
      this.update();
    }
    if (!this.connected || this.mode === "local") return;
    if (retryIn !== undefined) this.schedule(retryIn);
    else if (this.unsent > 0) this.schedule(this.flushMs);
  }

  private succeeded(total: number, by: number) {
    this.failures = 0;
    this.inFlight = 0;
    if (this.uncertain > 0) {
      // The total grew by at least the unanswered presses beyond this request's own: they landed,
      // so they are in `total` now and showing them in `local` too would count them twice here.
      if (this.synced && total - by - this.base >= this.uncertain) this.local -= this.uncertain;
      this.uncertain = 0;
    }
    this.base = total;
    this.synced = true;
  }

  /** Returns how long to wait before the next attempt, or undefined after falling back. */
  private failed(failure: CounterFailure, by: number): number | undefined {
    this.inFlight = 0;
    if (failure.kind === "rate-limited") {
      this.unsent += by;
      if (failure.retryAfterMs > this.maxRetryAfterMs) return this.fallBack();
      return failure.retryAfterMs;
    }
    if (failure.kind === "rejected") {
      this.unsent += by;
      if (!failure.retryable) return this.fallBack();
    } else {
      this.local += by;
      this.uncertain += by;
    }
    this.failures += 1;
    if (this.failures >= this.maxFailures) return this.fallBack();
    return Math.min(this.backoffMs * 2 ** (this.failures - 1), MAX_BACKOFF_MS);
  }

  private fallBack(): undefined {
    this.mode = "local";
    this.local += this.unsent;
    this.unsent = 0;
    this.clearTimer();
    return undefined;
  }

  private schedule(ms: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.send();
    }, ms);
  }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private notifiedMode: CounterMode = "shared";

  private update() {
    const next = this.base + this.unsent + this.inFlight + this.local;
    if (next === this.count && this.mode === this.notifiedMode) return;
    this.count = next;
    this.notifiedMode = this.mode;
    for (const listener of this.listeners) listener();
  }
}
