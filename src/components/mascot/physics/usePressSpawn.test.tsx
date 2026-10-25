import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_DELAY_MS, HOLD_RATE_PER_SECOND } from "./pressEmitter";
import { usePressSpawn } from "./usePressSpawn";

function Dropper({ spawn }: { spawn: (x: number, y: number) => void }) {
  return (
    <button type="button" {...usePressSpawn(spawn)}>
      drop
    </button>
  );
}

const HELD = 1 + HOLD_RATE_PER_SECOND; // one press plus one second of holding

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const hold = (ms: number) => act(() => vi.advanceTimersByTime(HOLD_DELAY_MS + ms));

describe("usePressSpawn", () => {
  it("holding the mouse emits continuously at the capped rate, from the pointer", () => {
    const spawn = vi.fn();
    const { getByRole } = render(<Dropper spawn={spawn} />);
    const button = getByRole("button");

    fireEvent.pointerDown(button, { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
    expect(spawn).toHaveBeenCalledWith(40, 50);
    hold(1000);
    fireEvent.pointerUp(button, { pointerId: 1 });
    hold(1000);
    expect(spawn).toHaveBeenCalledTimes(HELD);
  });

  it("holding a key emits at the same capped rate, even with key auto-repeat", () => {
    const spawn = vi.fn();
    const { getByRole } = render(<Dropper spawn={spawn} />);
    const button = getByRole("button");

    fireEvent.keyDown(button, { key: " " });
    for (let i = 0; i < 40; i++) {
      fireEvent.keyDown(button, { key: " ", repeat: true });
      act(() => vi.advanceTimersByTime((HOLD_DELAY_MS + 1000) / 40));
    }
    fireEvent.keyUp(button, { key: " " });
    hold(1000);
    expect(spawn).toHaveBeenCalledTimes(HELD);
  });

  it("stops when the pointer is cancelled, the button blurs, or the window loses focus", () => {
    const spawn = vi.fn();
    const { getByRole } = render(<Dropper spawn={spawn} />);
    const button = getByRole("button");
    const stops = [
      () => fireEvent.pointerCancel(button),
      () => fireEvent.blur(button),
      () => fireEvent.blur(window),
    ];
    for (const stop of stops) {
      spawn.mockClear();
      fireEvent.pointerDown(button, { button: 0, clientX: 1, clientY: 1, pointerId: 1 });
      stop();
      hold(1000);
      expect(spawn).toHaveBeenCalledTimes(1);
    }
  });

  it("ignores right clicks and other keys", () => {
    const spawn = vi.fn();
    const { getByRole } = render(<Dropper spawn={spawn} />);
    fireEvent.pointerDown(getByRole("button"), { button: 2, pointerId: 1 });
    fireEvent.keyDown(getByRole("button"), { key: "a" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("stops emitting on unmount", () => {
    const spawn = vi.fn();
    const { getByRole, unmount } = render(<Dropper spawn={spawn} />);
    fireEvent.pointerDown(getByRole("button"), { button: 0, pointerId: 1 });
    unmount();
    hold(1000);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
