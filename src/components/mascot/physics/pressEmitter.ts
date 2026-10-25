export const HOLD_DELAY_MS = 200;
export const HOLD_RATE_PER_SECOND = 10;

export interface PressEmitterOptions {
  /** How long a press must last before it starts repeating. Keeps single clicks deliberate. */
  delayMs?: number;
  /** Emissions per second while held. */
  ratePerSecond?: number;
}

export interface PressEmitter {
  /** Emits once now, then repeatedly while held. A second press while held is ignored. */
  press(x: number, y: number): void;
  /** Moves where held emissions appear. */
  move(x: number, y: number): void;
  release(): void;
  readonly pressed: boolean;
}

/**
 * Press-and-hold emission at a capped rate. Repeats come from one interval, never from input
 * events, so key auto-repeat or a flood of pointer events can't raise the rate.
 */
export function createPressEmitter(
  emit: (x: number, y: number) => void,
  { delayMs = HOLD_DELAY_MS, ratePerSecond = HOLD_RATE_PER_SECOND }: PressEmitterOptions = {},
): PressEmitter {
  let point: { x: number; y: number } | undefined;
  let delay: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;

  const release = () => {
    clearTimeout(delay);
    clearInterval(repeat);
    delay = repeat = point = undefined;
  };

  return {
    press(x, y) {
      if (point) return;
      point = { x, y };
      emit(x, y);
      delay = setTimeout(() => {
        repeat = setInterval(() => point && emit(point.x, point.y), 1000 / ratePerSecond);
      }, delayMs);
    },
    move(x, y) {
      if (point) point = { x, y };
    },
    release,
    get pressed() {
      return point !== undefined;
    },
  };
}
