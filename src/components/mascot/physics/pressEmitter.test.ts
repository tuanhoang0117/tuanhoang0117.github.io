import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPressEmitter, HOLD_DELAY_MS, HOLD_RATE_PER_SECOND } from "./pressEmitter";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createPressEmitter", () => {
  it("emits once per press, and nothing more before the hold delay", () => {
    const emit = vi.fn();
    const emitter = createPressEmitter(emit);
    emitter.press(10, 20);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(10, 20);
    vi.advanceTimersByTime(HOLD_DELAY_MS - 1);
    emitter.release();
    vi.advanceTimersByTime(2000);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("emits continuously while held, at the capped rate, from the latest point", () => {
    const emit = vi.fn();
    const emitter = createPressEmitter(emit);
    emitter.press(0, 0);
    vi.advanceTimersByTime(HOLD_DELAY_MS);
    emitter.move(5, 6);
    vi.advanceTimersByTime(1000);
    // One for the press, then exactly the rate for one second of holding.
    expect(emit).toHaveBeenCalledTimes(1 + HOLD_RATE_PER_SECOND);
    expect(emit).toHaveBeenLastCalledWith(5, 6);

    emitter.release();
    vi.advanceTimersByTime(2000);
    expect(emit).toHaveBeenCalledTimes(1 + HOLD_RATE_PER_SECOND);
    expect(emitter.pressed).toBe(false);
  });

  it("repeated presses while held don't raise the rate", () => {
    const emit = vi.fn();
    const emitter = createPressEmitter(emit);
    emitter.press(0, 0);
    for (let t = 0; t < 1000 + HOLD_DELAY_MS; t += 10) {
      emitter.press(0, 0);
      vi.advanceTimersByTime(10);
    }
    expect(emit).toHaveBeenCalledTimes(1 + HOLD_RATE_PER_SECOND);
  });
});
