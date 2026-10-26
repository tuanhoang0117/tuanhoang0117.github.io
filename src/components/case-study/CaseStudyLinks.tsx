import type { Link } from "../../content/types";
import { cardLift } from "../motion";
import { linkHints } from "./labels";

interface CaseStudyLinksProps {
  /** External links (the live site). Each opens in a new tab. */
  links: Link[];
  /** The team's case study PDF, served from public/. Downloads. */
  pdf?: Link;
}

const button = `inline-block border-2 border-ink px-4 py-2 font-mono text-sm font-bold ${cardLift.sm}`;

export function CaseStudyLinks({ links, pdf }: CaseStudyLinksProps) {
  if (links.length === 0 && !pdf) return null;

  return (
    <ul className="mt-6 flex flex-wrap gap-4">
      {links.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noreferrer" className={`bg-card ${button}`}>
            {l.label} <span aria-hidden="true">↗</span>
            <span className="sr-only"> {linkHints.newTab}</span>
          </a>
        </li>
      ))}
      {pdf && (
        <li>
          <a href={pdf.href} download className={`bg-gold-bright ${button}`}>
            {pdf.label} <span aria-hidden="true">↓</span>
            <span className="sr-only"> {linkHints.download}</span>
          </a>
        </li>
      )}
    </ul>
  );
}
