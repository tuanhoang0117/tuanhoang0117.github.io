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
  /** Award text, e.g. "Winner, Best Beginner Project". Absent if the project didn't place. */
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
