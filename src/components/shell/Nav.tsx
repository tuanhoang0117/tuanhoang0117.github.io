import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { NavLink, useLocation } from "react-router";
import { navLinks } from "../../content/site";
import { prefersReducedMotion } from "../motion/motion";

/** Moving between the toggle and the panel crosses no gap, but leave/enter fire as two events. */
export const MENU_LEAVE_GRACE_MS = 200;
/** A click this soon after a hover opened the menu was meant to open it, so it keeps it open. */
export const MENU_HOVER_CLICK_GRACE_MS = 400;
/** Keyboard users get focus on the first link once the panel is on its way in. */
export const MENU_FOCUS_DELAY_MS = 300;
/** Link reveal: the first starts after the panel has begun moving, then one step per link. */
export const MENU_REVEAL_START_MS = 250;
export const MENU_REVEAL_STEP_MS = 70;

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function canHover(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(HOVER_QUERY).matches;
}

/**
 * Site menu: a fixed three-line toggle at the top right that opens a panel of `navLinks` from
 * the right. A disclosure, not a modal: the page stays in place behind a dimmed backdrop, and
 * focus isn't trapped. Instead the menu closes when focus leaves it, so a Tab past the last link
 * never lands on something hidden under the panel.
 */
export function Nav() {
  // The menu belongs to the page it was opened on, so any navigation closes it, including
  // browser Back and Forward, not just a menu link.
  const { key: routeKey } = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === routeKey;
  // Forget the old page, or going Forward back to it would reopen the menu.
  if (openOn !== null && !open) setOpenOn(null);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const openedByKeyboard = useRef(false);
  const hoverOpenedAt = useRef<number | null>(null);
  const leaveTimer = useRef<number | undefined>(undefined);

  const cancelLeave = () => window.clearTimeout(leaveTimer.current);

  const close = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    hoverOpenedAt.current = null;
    setOpenOn(null);
  }, []);

  // The panel turns inert once closed, so focus left inside it would be lost. This runs before
  // the browser drops that focus. Focus that already moved out (a Tab into the page) stays put.
  useLayoutEffect(() => {
    if (!open && panelRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      toggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open || !openedByKeyboard.current) return;
    const focusedAtOpen = document.activeElement;
    let frame = 0;
    // The panel only turns visible on the frame after it opens, and a hidden link can't take
    // focus (with reduced motion the wait is 0ms, so the first try lands too early). Retry for a
    // few frames until the focus sticks.
    const tryFocus = (attempts: number) => {
      // A Tab or click during the wait already put focus where the user wants it.
      if (document.activeElement !== focusedAtOpen) return;
      const link = firstLinkRef.current;
      link?.focus({ preventScroll: true });
      if (link && document.activeElement !== link && attempts > 0) {
        frame = window.requestAnimationFrame(() => tryFocus(attempts - 1));
      }
    };
    const id = window.setTimeout(
      () => tryFocus(10),
      prefersReducedMotion() ? 0 : MENU_FOCUS_DELAY_MS,
    );
    return () => {
      window.clearTimeout(id);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const onToggleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // A keyboard-activated click (Enter or Space) has no pointer, so its detail is 0.
    const byKeyboard = e.detail === 0;
    if (open) {
      const hoverAt = hoverOpenedAt.current;
      if (!byKeyboard && hoverAt !== null && Date.now() - hoverAt < MENU_HOVER_CLICK_GRACE_MS) {
        hoverOpenedAt.current = null;
        return;
      }
      close();
      return;
    }
    openedByKeyboard.current = byKeyboard;
    hoverOpenedAt.current = null;
    setOpenOn(routeKey);
  };

  const onPointerEnter = () => {
    if (!canHover()) return;
    cancelLeave();
    if (!open) {
      openedByKeyboard.current = false;
      hoverOpenedAt.current = Date.now();
      setOpenOn(routeKey);
    }
  };

  // Focus left the toggle and panel for the page, so close. A null relatedTarget (window switch,
  // click on the backdrop) isn't a move into the page.
  const onNavBlur = (e: FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget;
    if (open && to && !e.currentTarget.contains(to)) close();
  };

  const onPointerLeave = () => {
    if (!open || !canHover()) return;
    cancelLeave();
    leaveTimer.current = window.setTimeout(close, MENU_LEAVE_GRACE_MS);
  };

  const reduced = prefersReducedMotion();
  const line = "absolute top-1/2 left-2.5 -mt-px h-0.5 w-5 bg-ink transition duration-400 ease-out";

  return (
    <header className="fixed top-3 right-3 z-50 sm:top-4 sm:right-4">
      <nav aria-label="Main" onBlur={onNavBlur}>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={onToggleClick}
          onMouseEnter={onPointerEnter}
          onMouseLeave={onPointerLeave}
          className="relative z-20 block size-11 border-2 border-ink bg-card shadow-block-sm"
        >
          <span aria-hidden="true" className={`${line} ${open ? "rotate-45" : "-translate-y-2"}`} />
          <span aria-hidden="true" className={`${line} ${open ? "opacity-0" : "opacity-100"}`} />
          <span aria-hidden="true" className={`${line} ${open ? "-rotate-45" : "translate-y-2"}`} />
        </button>

        {/* Normally a fixed layer can't add page scroll. But when an ancestor gains a transform
            or filter, this layer is laid out against that ancestor, and without the clip the
            parked panel would widen the page and zoom a phone out (e2e/banner.spec.ts sets one
            on #root and fails at 375px without it). */}
        <div className="pointer-events-none fixed inset-0 overflow-clip">
          <div
            aria-hidden="true"
            data-menu-backdrop=""
            onClick={close}
            className={[
              "pointer-events-auto absolute inset-0 bg-ink/40 transition-all duration-550",
              open ? "visible opacity-100 ease-out" : "invisible opacity-0 ease-in",
            ].join(" ")}
          />

          <div
            ref={panelRef}
            id={panelId}
            inert={!open}
            data-state={open ? "open" : "closed"}
            onMouseEnter={onPointerEnter}
            onMouseLeave={onPointerLeave}
            className={[
              "pointer-events-auto absolute inset-y-0 right-0 flex w-5/6 max-w-4xl flex-col justify-center overflow-y-auto bg-ink px-6 py-20 transition-all duration-550 sm:w-2/3 sm:px-12",
              open ? "visible translate-x-0 ease-out" : "invisible translate-x-full ease-in",
            ].join(" ")}
          >
            <ul className="border-t border-seal">
              {navLinks.map((link, i) => (
                <li key={link.href} className="border-b border-seal">
                  <NavLink
                    ref={i === 0 ? firstLinkRef : undefined}
                    to={link.href}
                    end={link.href === "/"}
                    onClick={close}
                    className={({ isActive }) =>
                      [
                        "block py-3 text-right font-display text-3xl leading-none uppercase sm:py-4 sm:text-5xl lg:text-7xl",
                        isActive
                          ? "text-canyon"
                          : "text-kennedy hover:text-canyon focus-visible:text-canyon",
                      ].join(" ")
                    }
                  >
                    {/* The mask: the label slides up into view from just below this box. */}
                    <span className="block overflow-hidden">
                      <span
                        data-menu-label=""
                        className={[
                          "block transition-transform duration-500",
                          open ? "translate-y-0 ease-out" : "translate-y-full ease-in",
                        ].join(" ")}
                        style={{
                          transitionDelay:
                            open && !reduced
                              ? `${MENU_REVEAL_START_MS + i * MENU_REVEAL_STEP_MS}ms`
                              : "0ms",
                        }}
                      >
                        {link.label}
                      </span>
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );
}
