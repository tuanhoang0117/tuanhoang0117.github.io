import type { ReactNode } from "react";
import type { Project } from "../../content/types";
import { pageThemes } from "../../styles/themes";
import { cardLift } from "../motion";
import { cardNumber, projectAccent } from "./accents";
import { ProjectLinks, StackTags } from "./ProjectParts";

// UI mechanics only.
const copy = { featured: "Featured" };

export type CardHeading = "h3" | "h4";

export interface CardProps {
  project: Project;
  /** Position on the page, 0-based. Drives the accent color. */
  accentIndex: number;
  /** Position in its list, 0-based. Drives the number on the strip. */
  number: number;
  /** The card title's heading level, one below the section or group it sits in. */
  heading: CardHeading;
  /**
   * Show the project's `period` on the strip. Off inside a timeline node, which already shows
   * its experience's dates.
   */
  showPeriod?: boolean;
  /** Extra grid placement classes. */
  className?: string;
}

/** A card's numbered top strip, filled with its accent color. */
export function CardStrip({
  accentIndex,
  number,
  children,
}: {
  accentIndex: number;
  number: number;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid="card-strip"
      className={`flex items-center justify-between gap-4 border-b-2 border-ink px-5 py-2 sm:px-6 ${projectAccent(accentIndex).fill}`}
    >
      <span className="label-mono text-ink">{cardNumber(number)}</span>
      {children}
    </div>
  );
}

/** Every card: ink border, white surface, a large block shadow in its accent, the shared lift. */
export const cardBase = `flex flex-col border-2 border-ink bg-card ${cardLift.lg}`;

/** A project card. It is as tall as its content: nothing pushes its links to the bottom. */
export function ProjectCard({
  project: p,
  accentIndex,
  number,
  heading: Heading,
  showPeriod = true,
  className = "",
}: CardProps) {
  const accent = projectAccent(accentIndex);
  const image = p.images[0];
  return (
    <article
      aria-labelledby={`project-${p.slug}`}
      data-testid="project-card"
      className={`${cardBase} ${accent.shadow} ${className}`}
    >
      <CardStrip accentIndex={accentIndex} number={number}>
        {showPeriod && p.period && <span className="label-mono text-ink">{p.period}</span>}
      </CardStrip>
      {image && (
        <img
          src={image.src}
          alt={image.alt}
          loading="lazy"
          className="aspect-video w-full border-b-2 border-ink object-cover"
        />
      )}
      <div className="flex flex-col gap-4 px-5 pt-5 pb-6 sm:px-6">
        <Heading id={`project-${p.slug}`} className="text-2xl font-bold tracking-tight">
          {p.title}
        </Heading>
        <p>{p.summary}</p>
        <StackTags items={p.stack} accent={accent} />
        <ProjectLinks project={p} accent={accent} />
      </div>
    </article>
  );
}

/**
 * The featured project: the full width of its grid, with its title in display type and its
 * stack (and image, when it has one) in a panel on the theme wash beside the text at desktop.
 */
export function FeaturedProjectCard({
  project: p,
  accentIndex,
  number,
  heading: Heading,
  showPeriod = true,
}: CardProps) {
  const accent = projectAccent(accentIndex);
  const image = p.images[0];
  const hasPanel = Boolean(image) || p.stack.length > 0;
  return (
    <article
      aria-labelledby={`project-${p.slug}`}
      data-testid="featured-project"
      className={`${cardBase} col-span-full ${accent.shadow}`}
    >
      <CardStrip accentIndex={accentIndex} number={number}>
        {showPeriod && p.period && <span className="label-mono text-ink">{p.period}</span>}
      </CardStrip>
      <div className="grid lg:grid-cols-12">
        <div
          className={`flex flex-col gap-5 px-5 py-8 sm:px-8 lg:p-10 ${hasPanel ? "lg:col-span-7" : "lg:col-span-12"}`}
        >
          <p className="self-start -rotate-2 border-2 border-ink bg-morro px-3 py-1 font-pixel text-sm text-ink uppercase shadow-block-sm">
            {copy.featured}
          </p>
          <Heading
            id={`project-${p.slug}`}
            className="font-display text-3xl tracking-tight break-words sm:text-4xl"
          >
            {p.title}
          </Heading>
          <p className="text-lg">{p.summary}</p>
          <ProjectLinks project={p} accent={accent} />
        </div>
        {hasPanel && (
          <div
            data-testid="featured-panel"
            className={`flex flex-col justify-center gap-6 border-t-2 border-ink px-5 py-8 sm:px-8 lg:col-span-5 lg:border-t-0 lg:border-l-2 lg:p-10 ${pageThemes.portfolio.wash}`}
          >
            {image && (
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                className="aspect-video w-full border-2 border-ink object-cover"
              />
            )}
            <StackTags items={p.stack} accent={accent} onWash />
          </div>
        )}
      </div>
    </article>
  );
}
