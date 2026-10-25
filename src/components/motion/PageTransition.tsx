import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { PAGE_ENTER_MS, pageKeyframes, playEntrance } from "./motion";

/**
 * Eases the page in on every route change. There's no exit animation: the old page is replaced
 * in the same commit, so it never lingers or flashes. Only opacity and transform animate, so
 * nothing reflows.
 *
 * The first page of a visit doesn't fade: the browser's own load is its entrance, and its cards
 * still enter through `<Stagger>`. That keeps the first paint at full contrast and full opacity.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  // The path the wrapper last showed. Comparing paths (not a "first run" flag) also keeps
  // StrictMode's repeated mount effect from fading the first page in development.
  const shown = useRef(pathname);

  // Layout effect: starts before the new page paints, so it never shows a frame at full opacity
  // first.
  useLayoutEffect(() => {
    const page = ref.current;
    if (!page || shown.current === pathname) return;
    shown.current = pathname;
    const animations = playEntrance([page], {
      keyframes: pageKeyframes,
      duration: PAGE_ENTER_MS,
      step: 0,
    });
    return () => animations.forEach((a) => a.cancel());
  }, [pathname]);

  return (
    <div ref={ref} data-page-transition="">
      {children}
    </div>
  );
}
