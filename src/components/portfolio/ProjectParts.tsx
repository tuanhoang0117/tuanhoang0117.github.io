import { Link } from "react-router";
import type { Link as ContentLink, Project } from "../../content/types";
import { pageThemes } from "../../styles/themes";
import { cardLift } from "../motion";
import type { ProjectAccent } from "./accents";
import { caseStudyHref } from "./project";

// UI mechanics only. Card copy comes from src/content/.
const copy = {
  caseStudy: "Case study",
  newTab: "(opens in a new tab)",
};

const wash = pageThemes.portfolio.wash;

interface StackTagsProps {
  items: readonly string[];
  accent: ProjectAccent;
  /** The tags sit on the theme wash (the featured card's panel). */
  onWash?: boolean;
}

export function StackTags({ items, accent, onWash = false }: StackTagsProps) {
  if (items.length === 0) return null;
  // On the featured card's wash panel the tags are a larger stacked list.
  const list = onWash ? "grid gap-3" : "flex flex-wrap gap-2";
  const tag = onWash
    ? "border-2 bg-card px-4 py-2 font-mono text-base text-ink shadow-block-sm"
    : `border-2 ${wash} px-2 py-0.5 font-mono text-xs text-ink`;
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

/** The screen-reader hint for a link that opens in a new tab. */
export function NewTabHint() {
  return (
    <>
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> {copy.newTab}</span>
    </>
  );
}

const button = `inline-block border-2 border-ink px-4 py-2 text-sm font-semibold ${cardLift.sm}`;

interface CardLinksProps {
  links: readonly ContentLink[];
  accent: ProjectAccent;
  /** An in-app case-study page, listed first. */
  caseStudy?: { href: string; title: string };
}

/**
 * A card's buttons: the case study first (an in-app page) when there is one, then each external
 * link from content, which opens in a new tab.
 */
export function CardLinks({ links, accent, caseStudy }: CardLinksProps) {
  if (!caseStudy && links.length === 0) return null;
  return (
    <ul data-testid="card-links" className="flex flex-wrap gap-4">
      {caseStudy && (
        <li>
          <Link
            to={caseStudy.href}
            aria-label={`${copy.caseStudy}: ${caseStudy.title}`}
            className={`${button} ${accent.fill}`}
          >
            {copy.caseStudy} →
          </Link>
        </li>
      )}
      {links.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noreferrer" className={`${button} bg-card`}>
            {l.label} <NewTabHint />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** A project's links: its case study when it has one, then its external links. */
export function ProjectLinks({ project, accent }: { project: Project; accent: ProjectAccent }) {
  const href = caseStudyHref(project);
  return (
    <CardLinks
      links={project.links}
      accent={accent}
      caseStudy={href ? { href, title: project.title } : undefined}
    />
  );
}
