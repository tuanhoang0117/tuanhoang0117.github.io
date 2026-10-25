import { useEffect, useMemo, type KeyboardEvent, type PointerEvent } from "react";
import { createPressEmitter, type PressEmitterOptions } from "./pressEmitter";

const centerOf = (el: Element) => {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

const isActivationKey = (key: string) => key === " " || key === "Enter";

/**
 * Event handlers for an element that drops tokens: one per press, then a stream at a capped rate
 * while the mouse, finger, or Space/Enter is held. Spread the result onto a button. Pass a stable
 * `spawn` (useCallback): a new one restarts the emitter.
 */
export function usePressSpawn(
  spawn: (x: number, y: number) => void,
  { delayMs, ratePerSecond }: PressEmitterOptions = {},
) {
  const emitter = useMemo(
    () => createPressEmitter(spawn, { delayMs, ratePerSecond }),
    [spawn, delayMs, ratePerSecond],
  );

  useEffect(() => {
    const release = () => emitter.release();
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      emitter.release();
    };
  }, [emitter]);

  const release = () => emitter.release();

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      emitter.press(event.clientX, event.clientY);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      emitter.move(event.clientX, event.clientY);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (!isActivationKey(event.key) || event.repeat) return;
      const { x, y } = centerOf(event.currentTarget);
      emitter.press(x, y);
    },
    onKeyUp(event: KeyboardEvent<HTMLElement>) {
      if (isActivationKey(event.key)) emitter.release();
    },
    onBlur: release,
  };
}
