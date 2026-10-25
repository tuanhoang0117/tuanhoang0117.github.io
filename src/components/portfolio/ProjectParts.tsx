import { Link } from "react-router";
import type { Project } from "../../content/types";
import { cardLift } from "../motion";
import type { ProjectAccent } from "./accents";
import { caseStudyHref } from "./project";

// UI mechanics only. Project copy comes from src/content/projects.ts.
const copy = {
  caseStudy: "Case study",
  newTab: "(opens in a new tab)",
};

interface StackTagsProps {
  items: string[];
  accent: ProjectAccent;
  /** The tags sit on the theme wash (the featured card's panel). */
  onWash?: boolean;
}

export function StackTags({ items, accent, onWash = false }: StackTagsProps) {
  if (items.length === 0) return null;
  // On the featured card's wash panel the tags are a larger stacked list that fills the panel.
  const list = onWash ? "grid gap-3" : "flex flex-wrap gap-2";
  const tag = onWash
    ? "border-2 bg-card px-4 py-2 font-mono text-base text-ink shadow-block-sm"
    : "border-2 bg-serenity px-2 py-0.5 font-mono text-xs text-ink";
  return (
    <ul className={list}>
      {items.map((s) => (
        <li key={s} data-testid="stack-tag" className={`${tag} ${accent.border}`}>
          {s}
        </li>
      ))}
    </ul>
  );
}

const button = `inline-block border-2 border-ink px-4 py-2 text-sm font-semibold ${cardLift.sm}`;

/**
 * The project's links: its case study first (an in-app page) when it has one, then each
 * external link from content, which opens in a new tab.
 */
export function ProjectLinks({ project, accent }: { project: Project; accent: ProjectAccent }) {
  const caseStudy = caseStudyHref(project);
  if (!caseStudy && project.links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-4">
      {caseStudy && (
        <li>
          <Link
            to={caseStudy}
            aria-label={`${copy.caseStudy}: ${project.title}`}
            className={`${button} ${accent.fill}`}
          >
            {copy.caseStudy} →
          </Link>
        </li>
      )}
      {project.links.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noreferrer" className={`${button} bg-card`}>
            {l.label} <span aria-hidden="true">↗</span>
            <span className="sr-only"> {copy.newTab}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
