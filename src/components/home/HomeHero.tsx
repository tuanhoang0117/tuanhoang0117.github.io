import { useCallback, useEffect, useRef, useState } from "react";
import { site } from "../../content/site";
import { mascotLabel } from "../../content/mascot";
import { useReducedMotion } from "../../pixel/useReducedMotion";
import { pageThemes } from "../../styles/themes";
import { Banner } from "../brand/Banner";
import { HeroTitle } from "../brand/HeroTitle";
import { Mascot, type MascotActivation } from "../mascot/Mascot";
import { PhysicsOverlay, type PhysicsOverlayHandle } from "../mascot/physics/PhysicsOverlay";
import { Stagger } from "../motion/Stagger";

const theme = pageThemes.home;
const HINT_ID = "mascot-hint";
const XL_QUERY = "(min-width: 80rem)";

function useXlLayout(): boolean {
  const get = () => typeof window !== "undefined" && window.matchMedia(XL_QUERY).matches;
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    const query = window.matchMedia(XL_QUERY);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}

/**
 * The home hero: the shimmering name and tagline beside the mustang. Pressing the mustang drops a
 * token into the full-window physics layer. The banner and the physics layer portal to <body>,
 * so nothing here may put a transform, filter, or perspective on their ancestors.
 */
export function HomeHero() {
  const heroRef = useRef<HTMLElement>(null);
  const physicsRef = useRef<PhysicsOverlayHandle>(null);
  const reduced = useReducedMotion();
  const xl = useXlLayout();
  const dropToken = useCallback(({ x, y }: MascotActivation) => {
    physicsRef.current?.spawnAt(x, y);
  }, []);

  return (
    <>
      <section
        ref={heroRef}
        className="relative mx-auto min-h-150 max-w-6xl overflow-x-clip px-4 pt-8 pb-20 sm:px-8 sm:pt-10 md:pb-12 lg:pt-16"
      >
        {xl && (
          <div className="pointer-events-none absolute -top-16 right-32 hidden xl:block">
            <div
              role="group"
              aria-label={mascotLabel}
              aria-describedby={reduced ? undefined : HINT_ID}
              className="relative top-24 -left-10 z-0 aspect-square w-150"
            >
              {/* Physics is off under reduced motion, so the hint would promise tokens that never fall. */}
              {!reduced && (
                <p id={HINT_ID} className="sr-only">
                  Click or press Enter or Space to drop tokens.
                </p>
              )}
              <Mascot className="pointer-events-auto" onActivate={dropToken} />
            </div>
          </div>
        )}

        <Stagger>
          <div className="relative z-10 min-w-0 xl:max-w-4xl">
            <HeroTitle />
            <p className={`prompt mt-6 text-base font-semibold sm:text-lg ${theme.accentText}`}>
              {site.tagline}
            </p>
          </div>
        </Stagger>
      </section>
      <PhysicsOverlay ref={physicsRef} />
      <Banner hideAfter={heroRef} avoidFollowingContent />
    </>
  );
}
