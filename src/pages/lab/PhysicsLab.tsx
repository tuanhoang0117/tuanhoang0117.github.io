import { useCallback, useRef } from "react";
import {
  PhysicsOverlay,
  type PhysicsOverlayHandle,
} from "../../components/mascot/physics/PhysicsOverlay";
import { usePressSpawn } from "../../components/mascot/physics/usePressSpawn";
import { PageHeader } from "../../components/ui/PageHeader";

// Test bench for the falling-token overlay (#24). The mascot isn't wired up yet, so a plain button
// stands in for its click: press to drop a token, hold to keep dropping them.
export function PhysicsLab() {
  const overlay = useRef<PhysicsOverlayHandle>(null);
  const spawn = useCallback((x: number, y: number) => overlay.current?.spawnAt(x, y), []);
  const press = usePressSpawn(spawn);

  return (
    <>
      <PageHeader title="Physics Lab" />
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <button
          type="button"
          {...press}
          className="label-mono touch-none border-2 border-ink bg-gold-bright px-4 py-3 shadow-block select-none transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          Drop token
        </button>
      </section>
      <PhysicsOverlay ref={overlay} />
    </>
  );
}
