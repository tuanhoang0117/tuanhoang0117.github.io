import { useCallback, useState } from "react";
import { mascotCounterLabel, mascotLabel, mascotPrompt } from "../../content/mascot";
import { useReducedMotion } from "../../pixel/useReducedMotion";
import { pageThemes } from "../../styles/themes";
import { Mascot, type MascotActivation } from "../mascot/Mascot";

const theme = pageThemes.home;
const HINT_ID = "mascot-hint";

interface HomeMascotProps {
  /** Called on every press, after the local counter has counted it. */
  onActivate?: (activation: MascotActivation) => void;
}

/**
 * The home page's mustang: a "Click me" prompt above it and a local press counter under it. The
 * counter counts every click, tap, Enter, and Space on this page only (it starts at 0 on each
 * visit) and is a polite live region, so screen readers hear the new total without losing focus.
 */
export function HomeMascot({ onActivate }: HomeMascotProps) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const activate = useCallback(
    (activation: MascotActivation) => {
      setCount((n) => n + 1);
      onActivate?.(activation);
    },
    [onActivate],
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
      <p data-mascot-prompt="" className={`label-mono text-center font-bold ${theme.accentText}`}>
        {mascotPrompt}
      </p>
      <Mascot onActivate={activate} className="mt-2" />
      <p
        data-mascot-counter=""
        aria-live="polite"
        aria-atomic="true"
        className="label-mono mt-2 text-center font-bold tabular-nums"
      >
        {mascotCounterLabel}: {count}
      </p>
    </div>
  );
}
