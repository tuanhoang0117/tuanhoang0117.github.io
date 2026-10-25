import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { PageTransition } from "../motion/PageTransition";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

export function Layout() {
  const { pathname } = useLocation();

  // Route changes start at the top of the new page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-graph">
      <a
        href="#main"
        className="label-mono sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-gold-bright focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}
