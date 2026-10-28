import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

interface HomeHeroProps {
  /** The intro card. From xl it sits beside the mustang, under the title; below xl, under it. */
  children?: ReactNode;
}

/**
 * The home hero: the shimmering name and tagline, the school strip edge to edge in the page flow,
 * then the intro. From xl the mustang joins as its own grid cell beside the intro, so it never
 * overlaps the title, tagline, strip, or intro. Pressing it drops a token into the full-window
 * physics layer, which portals to <body>, so nothing here may put a transform, filter, or
 * perspective on its ancestors.
 */
export function HomeHero({ children }: HomeHeroProps) {
  const physicsRef = useRef<PhysicsOverlayHandle>(null);
  const reduced = useReducedMotion();
  const xl = useXlLayout();
  const dropToken = useCallback(({ x, y }: MascotActivation) => {
    physicsRef.current?.spawnAt(x, y);
  }, []);

  return (
    <>
      <section className="pt-8 pb-20 sm:pt-10 lg:pt-16">
        <Stagger className="mx-auto max-w-6xl px-4 sm:px-8">
          <div>
            <HeroTitle />
            <p className={`prompt mt-6 text-base font-semibold sm:text-lg ${theme.accentText}`}>
              {site.tagline}
            </p>
          </div>
        </Stagger>

        <div className="mt-10 lg:mt-12">
          <Banner inline />
        </div>

        <div className="mx-auto mt-12 max-w-6xl px-4 sm:px-8 xl:mt-8 xl:grid xl:grid-cols-5 xl:items-center xl:gap-12">
          <div className="min-w-0 xl:col-span-3">{children}</div>

          {xl && (
            <div
              role="group"
              aria-label={mascotLabel}
              aria-describedby={reduced ? undefined : HINT_ID}
              className="hidden min-w-0 xl:col-span-2 xl:block"
            >
              {/* Physics is off under reduced motion, so the hint would promise tokens that never fall. */}
              {!reduced && (
                <p id={HINT_ID} className="sr-only">
                  Click or press Enter or Space to drop tokens.
                </p>
              )}
              <Mascot onActivate={dropToken} />
            </div>
          )}
        </div>
      </section>
      <PhysicsOverlay ref={physicsRef} />
    </>
  );
}
