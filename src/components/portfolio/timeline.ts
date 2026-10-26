import { projectsOf } from "../../content/experience";
import type { Experience, Project } from "../../content/types";

/** Newest first by ISO `start`; content order breaks ties. */
export function newestExperienceFirst(groups: readonly Experience[]): Experience[] {
  return [...groups].sort((a, b) => b.start.localeCompare(a.start));
}

/** How many project cards the timeline shows, so later sections can keep cycling accents. */
export function timelineCardCount(groups: readonly Experience[], all: readonly Project[]): number {
  return groups.reduce((n, g) => n + projectsOf(g, all).length, 0);
}

/**
 * Each experience, newest first, with its projects and the page-wide accent position of its
 * first card, so accents keep cycling from one node's cards into the next.
 */
export function timelineNodes(
  groups: readonly Experience[],
  all: readonly Project[],
  accentStart = 0,
) {
  const ordered = newestExperienceFirst(groups);
  return ordered.map((group, i) => {
    const before = timelineCardCount(ordered.slice(0, i), all);
    return { group, projects: projectsOf(group, all), accentStart: accentStart + before };
  });
}
