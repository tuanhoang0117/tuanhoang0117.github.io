import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { SkillGroup } from "../../content/types";
import { cardShadow, pageThemes } from "../../styles/themes";
import { cardLift } from "../motion";
import {
  ALL,
  groupSlug,
  parseFilter,
  SKILLS_PARAM,
  stackCards,
  visibleCards,
  type StackCard,
} from "./filter";
import { GlyphIcon } from "./GlyphIcon";

// UI mechanics only: the filter-bar name for screen readers, the "All" tab, and the pause button.
const ui = {
  filterLabel: "Filter skills by category",
  all: "All",
  pause: "Pause scrolling",
  play: "Play scrolling",
};

/** Carousel speed in CSS pixels per second. */
const SPEED = 40;

const theme = pageThemes.resume;

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function FilterButton({
  pressed,
  count,
  onClick,
  children,
}: {
  pressed: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex items-center gap-2 border-2 px-3 py-2 font-mono text-xs font-bold uppercase ${
        pressed ? "border-ink bg-gold-bright" : "border-transparent hover:border-ink"
      }`}
    >
      {children}
      <span className={pressed ? "text-ink" : "text-ink-muted"}>{count}</span>
    </button>
  );
}

function Card({ card, index, focusable }: { card: StackCard; index: number; focusable: boolean }) {
  return (
    <li
      tabIndex={focusable ? 0 : undefined}
      className={`relative h-16 w-56 shrink-0 border-2 border-ink bg-card p-2 ${cardLift.sm} ${cardShadow(theme, index)}`}
    >
      <p className="label-mono flex items-start gap-1 pr-10 text-ink-muted">
        <GlyphIcon glyph={card.group.glyph} />
        {card.group.label}
      </p>
      <p className="text-sm leading-5 font-bold">{card.name}</p>
      <p className="label-mono absolute top-2 right-2 text-ink-muted">{card.number}</p>
    </li>
  );
}

/**
 * Skills as a filterable, auto-scrolling row of small cards. The active filter lives in ?skills=.
 * The row is a plain overflow-x scroller that a timer nudges, so the reduced-motion version is
 * the same strip without the timer or the looping copies.
 */
export function StackCards({ groups }: { groups: SkillGroup[] }) {
  const [params, setParams] = useSearchParams();
  const active = parseFilter(params.get(SKILLS_PARAM), groups);
  const cards = useMemo(() => stackCards(groups), [groups]);
  const shown = visibleCards(cards, active);

  const reduced = usePrefersReducedMotion();
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [touching, setTouching] = useState(false);
  const [copies, setCopies] = useState(2);
  const moving = !reduced && !userPaused && !hovered && !focusWithin && !touching;

  const scroller = useRef<HTMLDivElement>(null);
  const firstList = useRef<HTMLUListElement>(null);

  // Enough copies that one list-width of scrolling never runs out of cards on the right.
  useLayoutEffect(() => {
    const el = scroller.current;
    const first = firstList.current;
    if (el) el.scrollLeft = 0;
    if (reduced) return;
    const measure = () => {
      const period = first?.offsetWidth ?? 0;
      const width = el?.clientWidth ?? 0;
      setCopies(period > 0 ? Math.max(2, Math.ceil(width / period) + 1) : 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [reduced, active]);

  useEffect(() => {
    const el = scroller.current;
    if (!moving || !el) return;
    let pos = el.scrollLeft;
    let expected = pos;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(now - last, 100);
      last = now;
      // The reader scrolled by hand: carry on from where they left it.
      if (Math.abs(el.scrollLeft - expected) > 1.5) pos = el.scrollLeft;
      pos += (SPEED * dt) / 1000;
      const period = firstList.current?.offsetWidth ?? 0;
      if (period > 0 && pos >= period) pos -= period;
      el.scrollLeft = pos;
      expected = el.scrollLeft;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [moving, copies]);

  const choose = (filter: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (filter === ALL) next.delete(SKILLS_PARAM);
        else next.set(SKILLS_PARAM, filter);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div
          role="group"
          aria-label={ui.filterLabel}
          className="flex flex-1 flex-wrap gap-2 border-2 border-ink bg-card p-2 shadow-block-sm"
        >
          <FilterButton pressed={active === ALL} count={cards.length} onClick={() => choose(ALL)}>
            {ui.all}
          </FilterButton>
          {groups.map((g) => {
            const slug = groupSlug(g.label);
            return (
              <FilterButton
                key={slug}
                pressed={active === slug}
                count={g.skills.length}
                onClick={() => choose(slug)}
              >
                <GlyphIcon glyph={g.glyph} />
                {g.label}
              </FilterButton>
            );
          })}
        </div>
        {!reduced && (
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            className="border-2 border-ink bg-gold-bright px-3 py-2 font-mono text-xs font-bold uppercase shadow-block-sm"
          >
            {userPaused ? ui.play : ui.pause}
          </button>
        )}
      </div>

      {/* Hidden cards are not rendered at all, so they're out of the accessibility tree. */}
      <div
        ref={scroller}
        data-testid="carousel"
        data-moving={moving}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
        }}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onTouchCancel={() => setTouching(false)}
        className="overflow-x-auto px-2 pt-3 pb-3"
      >
        <div className="flex w-max">
          {Array.from({ length: reduced ? 1 : copies }, (_, copy) => (
            <ul
              key={copy}
              ref={copy === 0 ? firstList : undefined}
              aria-hidden={copy > 0 ? true : undefined}
              className="flex gap-4 pr-4"
            >
              {shown.map((c, i) => (
                <Card key={c.number} card={c} index={i} focusable={copy === 0} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
