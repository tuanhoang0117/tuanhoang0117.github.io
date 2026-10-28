import type { Hackathon } from "../../content/types";
import { Stagger } from "../motion";
import { projectAccent } from "./accents";
import { eventDateLabel, newestFirst } from "./dates";
import { CardStrip, cardBase } from "./ProjectCard";
import { CardLinks, StackTags } from "./ProjectParts";

// UI mechanics only: the label before a hackathon's `role`, carried over from the earlier
// portfolio page. Hackathon copy comes from src/content/hackathons.ts.
const copy = { myPart: "My part" };

interface HackathonCardProps {
  hackathon: Hackathon;
  /** Position on the page, 0-based. Drives the accent color. */
  accentIndex: number;
  /** Position in the section, 0-based. Drives the number on the strip. */
  number: number;
}

/** A hackathon project: what the team built, what Tuan's part was, its stack and links. */
export function HackathonCard({ hackathon: h, accentIndex, number }: HackathonCardProps) {
  const accent = projectAccent(accentIndex);
  const date = eventDateLabel(h.date);
  return (
    <article
      aria-labelledby={`hackathon-${h.slug}`}
      data-testid="hackathon-card"
      className={`${cardBase} ${accent.shadow}`}
    >
      <CardStrip accentIndex={accentIndex} number={number}>
        {date && (
          <time dateTime={h.date} className="label-mono text-ink">
            {date}
          </time>
        )}
      </CardStrip>
      {h.image && (
        <img
          src={h.image.src}
          alt={h.image.alt}
          loading="lazy"
          className="aspect-video w-full border-b-2 border-ink object-cover"
        />
      )}
      <div className="flex flex-col gap-4 px-5 pt-5 pb-6 sm:px-6">
        <div>
          <p className="label-mono text-ink-muted">{h.event}</p>
          <h3 id={`hackathon-${h.slug}`} className="mt-1 text-2xl font-bold tracking-tight">
            {h.project}
          </h3>
        </div>
        {h.placement && (
          <p
            data-testid="placement"
            className="self-start border-2 border-ink bg-canyon px-3 py-1 font-mono text-sm font-semibold text-ink shadow-block-sm"
          >
            <span aria-hidden="true">★ </span>
            {h.placement}
          </p>
        )}
        <p>{h.summary}</p>
        <p data-testid="my-part">
          <span className="label-mono text-poly">{copy.myPart} — </span>
          {h.role}
        </p>
        <StackTags items={h.stack} accent={accent} />
        <CardLinks links={h.links} accent={accent} />
      </div>
    </article>
  );
}

interface HackathonGridProps {
  hackathons: readonly Hackathon[];
  /** The page-wide accent position of the first card. */
  accentStart?: number;
}

/**
 * The Hackathons section, newest first: one column on phones, two from tablets up. Cards are
 * as tall as their content (`items-start`) and enter in reading order.
 */
export function HackathonGrid({ hackathons, accentStart = 0 }: HackathonGridProps) {
  return (
    <Stagger className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
      {newestFirst(hackathons).map((h, i) => (
        <HackathonCard key={h.slug} hackathon={h} accentIndex={accentStart + i} number={i} />
      ))}
    </Stagger>
  );
}
