import { useCallback } from "react";
import { mascotCounterLabel, mascotLabel, mascotPrompt } from "../../content/mascot";
import { useReducedMotion } from "../../pixel/useReducedMotion";
import { pageThemes } from "../../styles/themes";
import { Mascot, type MascotActivation } from "../mascot/Mascot";
import type { CounterClient } from "../mascot/counter/client";
import type { SharedCounterOptions } from "../mascot/counter/sharedCounter";
import { useSharedCounter } from "../mascot/counter/useSharedCounter";

const theme = pageThemes.home;
const HINT_ID = "mascot-hint";

interface HomeMascotProps {
  /** Called on every press, after the counter has counted it. */
  onActivate?: (activation: MascotActivation) => void;
  /** Where the total comes from. Defaults to the build's client (shared, or local without one). */
  counterClient?: CounterClient;
  counterOptions?: SharedCounterOptions;
}

/**
 * The home page's mustang, with a "Click me" prompt and the press counter on one line above it.
 * The counter shows the total shared by every visitor (local to this page when the service is off
 * or down), moves by one at once on every click, tap, Enter, and Space, and is a polite live
 * region, so screen readers hear the new total without losing focus. Beyond one announcement per
 * press, the text changes once when the shared total first loads, and once when a batch's answer
 * shows that other visitors pressed too. A batch with no one else's presses changes nothing.
 */
export function HomeMascot({ onActivate, counterClient, counterOptions }: HomeMascotProps) {
  const reduced = useReducedMotion();
  const { count, mode, press } = useSharedCounter(counterClient, counterOptions);
  const activate = useCallback(
    (activation: MascotActivation) => {
      press();
      onActivate?.(activation);
    },
    [onActivate, press],
  );

  return (
    <div
      role="group"
      aria-label={mascotLabel}
      aria-describedby={reduced ? undefined : HINT_ID}
      className="min-w-0"
    >
      {/* Physics is off under reduced motion, so the hint would promise tokens that never fall. */}
      {!reduced && (
        <p id={HINT_ID} className="sr-only">
          Click or press Enter or Space to drop tokens.
        </p>
      )}
      {/* Prompt and counter share one line above the head. Tokens fall to the bottom of the
          window and pile up there, so anything under the mustang would end up buried. */}
      <div className="label-mono flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-bold">
        <p data-mascot-prompt="" className={theme.accentText}>
          {mascotPrompt}
        </p>
        <span aria-hidden="true">/</span>
        <p
          data-mascot-counter=""
          data-counter-mode={mode}
          aria-live="polite"
          aria-atomic="true"
          className="tabular-nums"
        >
          {mascotCounterLabel}: {count}
        </p>
      </div>
      <Mascot onActivate={activate} className="mt-2" />
    </div>
  );
}
