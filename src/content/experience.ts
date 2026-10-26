import type { Experience, Project } from "./types";

/** Newest first. A project listed here appears under it in Experience, not in Projects. */
export const experience: Experience[] = [
  {
    slug: "hack4impact-cal-poly",
    organization: "Hack4Impact Cal Poly",
    role: "Software Developer",
    period: "Aug 2026 – Present",
    start: "2026-08",
    projects: ["cal-poly-food-pantry"],
  },
  {
    slug: "develop-for-good",
    organization: "Develop for Good",
    role: "Volunteer Developer",
    period: "May – Aug 2026",
    start: "2026-05",
    end: "2026-08",
    projects: ["tar-syndrome-website"],
  },
  {
    slug: "ucsd-summer-internship-prep",
    organization: "UC San Diego Summer Internship Prep Program",
    role: "Student",
    period: "Jul – Aug 2025",
    start: "2025-07",
    end: "2025-08-01",
    projects: ["force-sensor-leds", "grid-occupancy-opencv"],
  },
];

/** An experience's projects, in the order it lists them. */
export function projectsOf(group: Experience, all: readonly Project[]): Project[] {
  return group.projects.flatMap((slug) => all.filter((p) => p.slug === slug));
}

/** Projects not built under any experience: the portfolio's Projects section. */
export function projectsOutsideExperience(
  all: readonly Project[],
  groups: readonly Experience[],
): Project[] {
  const used = new Set(groups.flatMap((g) => g.projects));
  return all.filter((p) => !used.has(p.slug));
}
