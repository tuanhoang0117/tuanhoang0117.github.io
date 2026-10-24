import type { SkillGroup } from "../../content/types";

/** Query parameter that holds the active filter: /resume?skills=frontend. */
export const SKILLS_PARAM = "skills";
export const ALL = "all";

/** URL-safe id for a skill group, from its label: "Backend & Data" -> "backend-data". */
export function groupSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface StackCard {
  name: string;
  group: SkillGroup;
  slug: string;
  /** Position in the full deck, "#01" onward. Stays the same when a filter hides other cards. */
  number: string;
}

export function stackCards(groups: SkillGroup[]): StackCard[] {
  return groups
    .flatMap((group) => group.skills.map((name) => ({ name, group, slug: groupSlug(group.label) })))
    .map((card, i) => ({ ...card, number: `#${String(i + 1).padStart(2, "0")}` }));
}

/** The active filter from a URL value: a group's slug, or ALL when missing or unknown. */
export function parseFilter(value: string | null, groups: SkillGroup[]): string {
  return groups.some((g) => groupSlug(g.label) === value) ? value! : ALL;
}

export function visibleCards(cards: StackCard[], filter: string): StackCard[] {
  return filter === ALL ? cards : cards.filter((c) => c.slug === filter);
}
