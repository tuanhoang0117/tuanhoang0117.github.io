import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CounterError, createLocalCounterClient, type CounterClient } from "./client";
import { SharedCounter } from "./sharedCounter";

interface Call {
  op: "read" | "increment";
  by: number;
  keepalive: boolean;
  resolve: (total: number) => void;
  reject: (error: unknown) => void;
}

/**
 * A stand-in for the Worker that holds every request until the test answers it, and keeps its own
 * total of what it actually counted, so tests can compare that with what was pressed.
 */
class FakeServer implements CounterClient {
  readonly kind = "http" as const;
  total: number;
  readonly calls: Call[] = [];
  private open: Call[] = [];

  constructor(total = 0) {
    this.total = total;
  }

  read() {
    return this.call("read", 0);
  }

  increment(by: number, { keepalive = false } = {}) {
    return this.call("increment", by, keepalive);
  }

  private call(op: Call["op"], by: number, keepalive = false) {
    return new Promise<number>((resolve, reject) => {
      const call = { op, by, keepalive, resolve, reject };
      this.calls.push(call);
      this.open.push(call);
    });
  }

  get waiting() {
    return this.open.length;
  }

  get increments() {
    return this.calls.filter((c) => c.op === "increment").map((c) => c.by);
  }

  private next() {
    const call = this.open.shift();
    if (!call) throw new Error("no request is waiting");
    return call;
  }

  /** Counts the request (others may have pressed too) and answers with the new total. */
  ok(othersPressed = 0) {
    const call = this.next();
    this.total += othersPressed + call.by;
    call.resolve(this.total);
  }

  rateLimit(retryAfterMs: number) {
    this.next().reject(new CounterError({ kind: "rate-limited", retryAfterMs }));
  }

  refuse(status: number) {
    this.next().reject(new CounterError({ kind: "rejected", status, retryable: status >= 500 }));
  }

  /** The request never arrived. */
  drop() {
    this.next().reject(new CounterError({ kind: "network" }));
  }

  /** The request arrived and was counted, but the answer was lost on the way back. */
  lose() {
    const call = this.next();
    this.total += call.by;
    call.reject(new CounterError({ kind: "network" }));
  }
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function press(counter: SharedCounter, times: number) {
  for (let i = 0; i < times; i++) counter.press();
}

async function connected(server: FakeServer, options = {}) {
  const counter = new SharedCounter(server, options);
  counter.connect();
  expect(server.calls.map((c) => c.op)).toEqual(["read"]);
  server.ok();
  await settle();
  return counter;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SharedCounter", () => {
  it("reads the shared total when it connects", async () => {
    const server = new FakeServer(41);
    const counter = new SharedCounter(server);
    expect(counter.getCount()).toBe(0);
    counter.connect();
    server.ok();
    await settle();
    expect(counter.getCount()).toBe(41);
    expect(counter.getMode()).toBe("shared");
  });

  it("shows each press at once, before anything is sent", async () => {
    const server = new FakeServer(41);
    const counter = await connected(server);
    const seen: number[] = [];
    counter.subscribe(() => seen.push(counter.getCount()));

    counter.press();
    expect(counter.getCount()).toBe(42);
    counter.press();
    expect(counter.getCount()).toBe(43);
    expect(seen).toEqual([42, 43]);
    expect(server.increments).toEqual([]);
  });

  it("batches rapid presses into one increment a second", async () => {
    const server = new FakeServer(10);
    const counter = await connected(server);

    press(counter, 3);
    await wait(500);
    press(counter, 4);
    await wait(499);
    expect(server.increments).toEqual([]);
    await wait(1);
    expect(server.increments).toEqual([7]);

    server.ok();
    await settle();
    expect(counter.getCount()).toBe(17);
    expect(server.total).toBe(17);
  });

  it("caps each increment at 50 and sends the rest in the next batches", async () => {
    const server = new FakeServer();
    const counter = await connected(server);

    press(counter, 120);
    for (const expected of [50, 50, 20]) {
      await wait(1000);
      expect(server.increments.at(-1)).toBe(expected);
      server.ok();
      await settle();
    }
    expect(server.increments).toEqual([50, 50, 20]);
    expect(server.total).toBe(120);
    expect(counter.getCount()).toBe(120);
  });

  it("keeps one request out at a time; presses meanwhile go in the next batch", async () => {
    const server = new FakeServer();
    const counter = await connected(server);

    press(counter, 2);
    await wait(1000);
    press(counter, 5);
    await wait(5000);
    expect(server.waiting).toBe(1);
    expect(server.increments).toEqual([2]);
    server.ok();
    await settle();
    await wait(1000);
    expect(server.increments).toEqual([2, 5]);
  });

  it("doesn't change the shown total when a batch is confirmed, so nothing extra is announced", async () => {
    const server = new FakeServer(100);
    const counter = await connected(server);
    const seen: number[] = [];
    counter.subscribe(() => seen.push(counter.getCount()));

    press(counter, 5);
    await wait(1000);
    server.ok();
    await settle();
    expect(seen).toEqual([101, 102, 103, 104, 105]);
  });

  it("shows other visitors' presses when a batch comes back", async () => {
    const server = new FakeServer(100);
    const counter = await connected(server);
    press(counter, 2);
    await wait(1000);
    server.ok(30);
    await settle();
    expect(counter.getCount()).toBe(132);
  });

  it("waits out a 429's Retry-After, then sends the refused presses once", async () => {
    const server = new FakeServer();
    const counter = await connected(server);

    press(counter, 3);
    await wait(1000);
    server.rateLimit(2500);
    await settle();
    expect(counter.getCount()).toBe(3);
    press(counter, 2);
    await wait(2499);
    expect(server.increments).toEqual([3]);
    await wait(1);
    expect(server.increments).toEqual([3, 5]);
    server.ok();
    await settle();
    expect(server.total).toBe(5);
    expect(counter.getCount()).toBe(5);
    expect(counter.getMode()).toBe("shared");
  });

  it("retries a 5xx with doubling backoff and counts its presses once", async () => {
    const server = new FakeServer();
    const counter = await connected(server);

    press(counter, 4);
    await wait(1000);
    server.refuse(503);
    await settle();
    await wait(999);
    expect(server.increments).toEqual([4]);
    await wait(1);
    expect(server.increments).toEqual([4, 4]);
    server.refuse(503);
    await settle();
    await wait(1999);
    expect(server.increments).toEqual([4, 4]);
    await wait(1);
    expect(server.increments).toEqual([4, 4, 4]);
    server.ok();
    await settle();
    expect(server.total).toBe(4);
    expect(counter.getCount()).toBe(4);
  });

  it("never sends a batch again after a network error, since it may have landed", async () => {
    const server = new FakeServer(10);
    const counter = await connected(server);

    press(counter, 3);
    await wait(1000);
    server.drop();
    await settle();
    expect(counter.getCount()).toBe(13);

    // The backoff retry checks in with the service; it doesn't resend the 3.
    await wait(1000);
    expect(server.calls.at(-1)?.op).toBe("read");
    server.ok();
    await settle();
    press(counter, 2);
    await wait(1000);
    expect(server.increments).toEqual([3, 2]);
    server.ok();
    await settle();
    expect(server.total).toBe(12);
    // This visitor still sees their 3 presses, even though the shared total missed them.
    expect(counter.getCount()).toBe(15);
  });

  it("doesn't show a batch twice when it landed but its answer was lost", async () => {
    const server = new FakeServer(10);
    const counter = await connected(server);

    press(counter, 3);
    await wait(1000);
    server.lose();
    await settle();
    expect(server.total).toBe(13);
    expect(counter.getCount()).toBe(13);

    press(counter, 2);
    await wait(1000);
    expect(server.increments).toEqual([3, 2]);
    server.ok();
    await settle();
    expect(server.total).toBe(15);
    expect(counter.getCount()).toBe(15);
  });

  it("falls back to local counting after repeated failures and keeps counting", async () => {
    const server = new FakeServer();
    const counter = new SharedCounter(server);
    counter.connect();
    for (const backoff of [1000, 2000, 4000]) {
      server.drop();
      await settle();
      await wait(backoff);
    }
    expect(server.calls).toHaveLength(4);
    press(counter, 2);
    server.drop();
    await settle();
    expect(counter.getMode()).toBe("local");
    expect(counter.getCount()).toBe(2);

    press(counter, 3);
    await wait(60_000);
    expect(server.calls).toHaveLength(4);
    expect(counter.getCount()).toBe(5);
  });

  it("falls back at once on a refusal that won't go away (403) or a long Retry-After", async () => {
    for (const fail of [
      (s: FakeServer) => s.refuse(403),
      (s: FakeServer) => s.rateLimit(3_600_000),
    ]) {
      const server = new FakeServer(50);
      const counter = await connected(server);
      press(counter, 2);
      await wait(1000);
      fail(server);
      await settle();
      expect(counter.getMode()).toBe("local");
      expect(counter.getCount()).toBe(52);
      press(counter, 1);
      await wait(60_000);
      expect(server.increments).toEqual([2]);
      expect(counter.getCount()).toBe(53);
    }
  });

  it("sends waiting presses once when it disconnects, and stops its timers", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    press(counter, 3);
    counter.disconnect();
    expect(server.increments).toEqual([3]);
    server.refuse(503);
    await wait(60_000);
    expect(server.increments).toEqual([3]);
  });

  it("sends presses on disconnect with keepalive, and batches without it", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    press(counter, 2);
    await wait(1000);
    server.ok();
    await settle();
    press(counter, 3);
    counter.disconnect();
    expect(server.calls.filter((c) => c.op === "increment").map((c) => c.keepalive)).toEqual([
      false,
      true,
    ]);
  });

  it("sends nothing more when it disconnects twice (pagehide, then React cleanup)", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    press(counter, 3);
    counter.disconnect();
    counter.disconnect();
    expect(server.increments).toEqual([3]);
    server.ok();
    await settle();
    counter.disconnect();
    await wait(60_000);
    expect(server.increments).toEqual([3]);
    expect(server.total).toBe(3);
  });

  it("never starts a second request on disconnect while one is out", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    press(counter, 3);
    await wait(1000);
    expect(server.waiting).toBe(1);
    press(counter, 2);
    counter.disconnect();
    expect(server.waiting).toBe(1);
    expect(server.increments).toEqual([3]);
    server.ok();
    await settle();
    await wait(60_000);
    expect(server.increments).toEqual([3]);
  });

  it("waits at least a second after a 429 with Retry-After 0", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    press(counter, 3);
    await wait(1000);
    server.rateLimit(0);
    await settle();
    await wait(999);
    expect(server.increments).toEqual([3]);
    await wait(1);
    expect(server.increments).toEqual([3, 3]);
  });

  it("doesn't count 429s toward falling back", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    press(counter, 3);
    await wait(1000);
    for (let i = 0; i < 6; i++) {
      server.rateLimit(1000);
      await settle();
      await wait(1000);
    }
    expect(counter.getMode()).toBe("shared");
    expect(server.increments).toEqual([3, 3, 3, 3, 3, 3, 3]);
    server.ok();
    await settle();
    expect(server.total).toBe(3);
  });

  it("starts the failure count over after each success, so only failures in a row fall back", async () => {
    const server = new FakeServer();
    const counter = await connected(server);
    for (let round = 0; round < 3; round++) {
      // Three failures, one short of falling back, then a success.
      for (let i = 0; i < 3; i++) {
        press(counter, 1);
        await wait(1000);
        server.refuse(503);
        await settle();
        await wait(4000);
      }
      server.ok();
      await settle();
      expect(counter.getMode()).toBe("shared");
    }
    expect(server.total).toBe(9);
    // The backoff starts over too: the next failure waits 1 s, not 8 s.
    press(counter, 1);
    await wait(1000);
    server.refuse(503);
    await settle();
    await wait(1000);
    expect(server.waiting).toBe(1);
  });

  it("never moves the shown number backwards when it settles a request that got no answer", async () => {
    // Each case: what happened to the first batch of 3, then 2 more presses whose answer shows
    // others' presses. Whether the 3 landed is read from how much the total grew beyond those 2,
    // so 4 presses by others look the same as the 3 landing.
    for (const { first, others, shown } of [
      { first: "lose", others: 0, shown: 15 },
      { first: "drop", others: 1, shown: 16 },
      { first: "drop", others: 4, shown: 16 },
    ] as const) {
      const server = new FakeServer(10);
      const counter = await connected(server);
      const seen: number[] = [];
      counter.subscribe(() => seen.push(counter.getCount()));
      press(counter, 3);
      await wait(1000);
      server[first]();
      await settle();
      press(counter, 2);
      await wait(1000);
      server.ok(others);
      await settle();
      expect(seen, `${first}, others ${others}`).toEqual([...seen].sort((a, b) => a - b));
      expect(counter.getCount(), `${first}, others ${others}`).toBe(shown);
    }
  });

  it("settles a request that got no answer only once", async () => {
    const server = new FakeServer(10);
    const counter = await connected(server);
    press(counter, 3);
    await wait(1000);
    server.lose();
    await settle();
    press(counter, 2);
    await wait(1000);
    server.ok();
    await settle();
    expect(counter.getCount()).toBe(15);

    // Others press later; the 3 were already taken out of this visitor's own count.
    const seen: number[] = [];
    counter.subscribe(() => seen.push(counter.getCount()));
    press(counter, 1);
    await wait(1000);
    server.ok(5);
    await settle();
    expect(seen).toEqual([16, 21]);
    expect(server.total).toBe(21);
  });

  it("works the same over the local client", async () => {
    const counter = new SharedCounter(createLocalCounterClient());
    counter.connect();
    await settle();
    press(counter, 3);
    expect(counter.getCount()).toBe(3);
    await wait(1000);
    expect(counter.getCount()).toBe(3);
    expect(counter.getMode()).toBe("shared");
  });

  it("never counts a press twice on the server, whatever fails", async () => {
    // A seeded mix of answers, checked against the server's own tally.
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 40; run++) {
      const server = new FakeServer();
      const counter = new SharedCounter(server, { maxFailures: 1000 });
      counter.connect();
      let pressed = 0;
      let lost = 0;
      for (let step = 0; step < 60; step++) {
        const n = Math.floor(random() * 4);
        press(counter, n);
        pressed += n;
        if (server.waiting > 0) {
          const roll = random();
          const by = server.calls.at(-1)!.by;
          if (roll < 0.4) server.ok();
          else if (roll < 0.55) server.rateLimit(500);
          else if (roll < 0.7) server.refuse(503);
          else if (roll < 0.85) {
            server.drop();
            lost += by;
          } else server.lose();
        }
        await wait(Math.floor(random() * 3000));
        expect(server.total).toBeLessThanOrEqual(pressed);
      }
      // Let everything still waiting go through.
      for (let i = 0; i < 20; i++) {
        if (server.waiting > 0) server.ok();
        await wait(70_000);
      }
      expect(server.total).toBe(pressed - lost);
      expect(server.increments.every((by) => by >= 1 && by <= 50)).toBe(true);
    }
  });
});
