import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { site } from "../../content/site";
import { pageThemes } from "../../styles/themes";
import { Banner } from "../brand/Banner";
import { HeroTitle } from "../brand/HeroTitle";
import type { MascotActivation } from "../mascot/Mascot";
import { PhysicsOverlay, type PhysicsOverlayHandle } from "../mascot/physics/PhysicsOverlay";
import { Stagger } from "../motion/Stagger";
import { HomeMascot } from "./HomeMascot";

const theme = pageThemes.home;
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
 * The home hero: the school strip edge to edge at the top of the page flow, then the shimmering
 * name and tagline, then the intro. From xl the mustang joins as its own grid cell beside the
 * intro, so it never overlaps the title, tagline, strip, or intro. Pressing it drops a token into
 * the full-window physics layer, which portals to <body>, so nothing here may put a transform,
 * filter, or perspective on its ancestors.
 */
export function HomeHero({ children }: HomeHeroProps) {
  const physicsRef = useRef<PhysicsOverlayHandle>(null);
  const xl = useXlLayout();
  const dropToken = useCallback(({ x, y }: MascotActivation) => {
    physicsRef.current?.spawnAt(x, y);
  }, []);

  return (
    <>
      {/* The fixed home link and menu toggle end 59px down on phones and 63px from sm, shadow
          included. Layout's top padding plus this section's puts the strip's top edge at 60px on
          phones and 64px from sm, so the strip starts just under them and they never cover it.
          e2e/home.spec.ts checks this at every width. */}
      <section className="pt-8 pb-20 sm:pt-10 lg:pt-16">
        <Banner inline />

        <Stagger className="mx-auto mt-10 max-w-6xl px-4 sm:px-8 lg:mt-12">
          <div>
            <HeroTitle />
            <p className={`prompt mt-6 text-base font-semibold sm:text-lg ${theme.accentText}`}>
              {site.tagline}
            </p>
          </div>
        </Stagger>

        <div className="mx-auto mt-12 max-w-6xl px-4 sm:px-8 xl:mt-8 xl:grid xl:grid-cols-5 xl:items-center xl:gap-12">
          <div className="min-w-0 xl:col-span-3">{children}</div>

          {/* Below xl there is no mustang, so no prompt or counter either. */}
          {xl && (
            <div className="hidden min-w-0 xl:col-span-2 xl:block">
              <HomeMascot onActivate={dropToken} />
            </div>
          )}
        </div>
      </section>
      <PhysicsOverlay ref={physicsRef} />
    </>
  );
}
