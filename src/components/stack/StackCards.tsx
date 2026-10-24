import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { SkillGroup } from "../../content/types";
import { ALL, groupSlug, parseFilter, SKILLS_PARAM, stackCards, visibleCards } from "./filter";
import { GlyphIcon } from "./GlyphIcon";

// UI mechanics only: the filter-bar name for screen readers and the "All" tab.
const ui = { filterLabel: "Filter skills by category", all: "All" };

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

/** Skills as a filterable grid of trading cards. The active filter lives in ?skills=. */
export function StackCards({ groups }: { groups: SkillGroup[] }) {
  const [params, setParams] = useSearchParams();
  const active = parseFilter(params.get(SKILLS_PARAM), groups);
  const cards = useMemo(() => stackCards(groups), [groups]);
  const shown = visibleCards(cards, active);

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
    <div className="space-y-6">
      <div
        role="group"
        aria-label={ui.filterLabel}
        className="flex flex-wrap gap-2 border-2 border-ink bg-card p-2 shadow-block-sm"
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

      {/* Hidden cards are not rendered at all, so they're out of the accessibility tree. */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((c) => (
          <li
            key={c.number}
            className="flex aspect-square flex-col border-2 border-ink bg-card p-3 shadow-block sm:aspect-3/4 motion-safe:transition-transform motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5"
          >
            <p className="label-mono flex items-start gap-1 text-ink-muted">
              <GlyphIcon glyph={c.group.glyph} />
              {c.group.label}
            </p>
            <p className="mt-4 font-bold break-words">{c.name}</p>
            <p className="label-mono mt-auto pt-2 text-right text-ink-muted">{c.number}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
