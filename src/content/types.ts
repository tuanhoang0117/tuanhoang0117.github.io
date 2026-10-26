/**
 * Content schema. Every page renders from data typed here; pages never hard-code project copy.
 * Spec: docs/contracts/content-schema.md. Changing a type here is a contract change and needs
 * its own issue.
 */

export interface Link {
  label: string;
  href: string;
}

export interface Image {
  src: string;
  alt: string;
}

/** Pastel wash used for archive columns and accent shadows. Maps to --color-tint-* tokens. */
export type Tint = "peach" | "butter" | "mint" | "sky" | "lilac";

/** A personal or class project. */
export interface Project {
  slug: string;
  title: string;
  summary: string;
  stack: string[];
  images: Image[];
  links: Link[];
  /** When the work happened, as display text, e.g. "May – Aug 2026". Absent if unknown. */
  period?: string;
  /** Shown first and larger on the portfolio page. */
  featured?: boolean;
  /** A written case study, rendered at /portfolio/:slug. Projects without one link out only. */
  caseStudy?: CaseStudy;
}

/**
 * A project's case study. First person where it describes Tuan's own work. Never name teammates
 * or the client's contacts: say "the team" or "the association".
 */
export interface CaseStudy {
  /** Who the project was for and what it was. */
  overview: string;
  /** What needed solving. */
  problem: string;
  /** How the work went, in order. */
  process: { title: string; detail: string }[];
  /** What Tuan personally did, one claim per entry. Only what the private fact sheet confirms. */
  role: string[];
  /** A short first-person reflection, kept apart from `role` because it isn't a work claim. */
  reflection?: string;
  results: string[];
  /** Tools the team used. */
  tools: string[];
  /** The team's full case study, a PDF served from public/ (a root-relative path). */
  pdf?: Link;
}

/**
 * A program, club, or team Tuan built projects under. The portfolio shows these as a timeline,
 * newest first, with the projects built under each nested inside it.
 */
export interface Experience {
  slug: string;
  organization: string;
  /** His role there, as it appears on his resume. */
  role: string;
  /** The dates as display text, e.g. "May – Aug 2026". */
  period: string;
  /** ISO start (`YYYY-MM` or `YYYY-MM-DD`): for `<time dateTime>` and for the newest-first order. */
  start: string;
  /** ISO end, same formats. Absent means ongoing. */
  end?: string;
  link?: Link;
  /**
   * Placeholder for an organization logo. Unused until Tuan supplies one he may show: an image
   * under `public/`, with alt text. Components render nothing for it while it is absent.
   */
  logo?: Image;
  /** Slugs of the projects built under it, in display order. Each project is under at most one. */
  projects: string[];
}

/** A project built at a hackathon. Powers the archive and per-event detail pages. */
export interface Hackathon {
  slug: string;
  /** Project name, e.g. "oculusMD". */
  project: string;
  /** Event name, e.g. "QuackHacks 3". */
  event: string;
  /** ISO date (YYYY-MM-DD or YYYY-MM) of the event start. Optional until confirmed. */
  date?: string;
  location?: string;
  /** What the project is. Describes the team's project. */
  summary: string;
  /**
   * What Tuan personally built or did, in first person. Required so team work and individual
   * work are never blurred. Never name teammates.
   */
  role: string;
  stack: string[];
  /**
   * Award text for a win, e.g. "Winner, Best Beginner Project". Wins only: an event that didn't
   * win has no placement, so the WINNER sticker shows only on wins (Tuan, PR #14).
   */
  placement?: string;
  /** Headline numbers for the detail page stats bar. Filled in as they're confirmed. */
  stats?: {
    teamSize?: number;
    hours?: number;
    participants?: number;
  };
  image?: Image;
  links: Link[];
  tint: Tint;
}

export interface ResumeEntry {
  title: string;
  location?: string;
  detail?: string;
  bullets: string[];
}

/** Game-UI category icon. Each maps to one shape and one glyph-* color. */
export type Glyph = "square" | "triangle" | "diamond" | "circle" | "plus";

export interface SkillGroup {
  label: string;
  glyph: Glyph;
  skills: string[];
}

export interface Resume {
  /** Path to the downloadable PDF in public/. */
  pdf: string;
  education: ResumeEntry[];
  skills: SkillGroup[];
  experience: ResumeEntry[];
  projects: ResumeEntry[];
}

/**
 * What the home page mascot renders. A procedural placeholder until the approved mustang art
 * arrives; switching to the image is a change to `src/content/mascot.ts` only.
 */
export type MascotVisualSource =
  { kind: "procedural-placeholder" } | { kind: "image"; idleSrc: string; activeSrc?: string };
