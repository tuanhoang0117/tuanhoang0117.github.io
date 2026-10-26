import { useCallback, useRef } from "react";
import { site } from "../../content/site";
import { mascotLabel } from "../../content/mascot";
import { useReducedMotion } from "../../pixel/useReducedMotion";
import { pageThemes, cardShadow } from "../../styles/themes";
import { Banner } from "../brand/Banner";
import { HeroTitle } from "../brand/HeroTitle";
import { Mascot, type MascotActivation } from "../mascot/Mascot";
import { PhysicsOverlay, type PhysicsOverlayHandle } from "../mascot/physics/PhysicsOverlay";
import { Stagger } from "../motion/Stagger";

const theme = pageThemes.home;
const HINT_ID = "mascot-hint";

/**
 * The home hero: the shimmering name and tagline beside the mustang. Pressing the mustang drops a
 * token into the full-window physics layer. The banner and the physics layer portal to <body>,
 * so nothing here may put a transform, filter, or perspective on their ancestors.
 */
export function HomeHero() {
  const heroRef = useRef<HTMLElement>(null);
  const physicsRef = useRef<PhysicsOverlayHandle>(null);
  const reduced = useReducedMotion();
  const dropToken = useCallback(({ x, y }: MascotActivation) => {
    physicsRef.current?.spawnAt(x, y);
  }, []);

  return (
    <>
      <section
        ref={heroRef}
        className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 lg:pt-16"
      >
        <Stagger className="grid items-center gap-8 sm:gap-10 lg:grid-cols-5 lg:gap-12">
          <div className="min-w-0 lg:col-span-3">
            <HeroTitle />
            <p className={`prompt mt-6 text-base font-semibold sm:text-lg ${theme.accentText}`}>
              {site.tagline}
            </p>
          </div>

          <div
            role="group"
            aria-label={mascotLabel}
            aria-describedby={reduced ? undefined : HINT_ID}
            className={`mx-auto w-full max-w-60 border-2 border-ink bg-card p-3 shadow-block-lg sm:max-w-sm lg:col-span-2 lg:max-w-none ${cardShadow(theme, 1)}`}
          >
            {/* Physics is off under reduced motion, so the hint would promise tokens that never fall. */}
            {!reduced && (
              <p id={HINT_ID} className="sr-only">
                Click or press Enter or Space to drop tokens.
              </p>
            )}
            <Mascot onActivate={dropToken} />
          </div>
        </Stagger>
      </section>
      <PhysicsOverlay ref={physicsRef} />
      <Banner hideAfter={heroRef} />
    </>
  );
}
