import type { Project } from "../../content/types";
import { cardLift } from "../motion";
import { cardNumber, projectAccent } from "./accents";
import { ProjectLinks, StackTags } from "./ProjectParts";

// UI mechanics only.
const copy = { featured: "Featured" };

interface CardProps {
  project: Project;
  /** Position on the page, 0-based. Drives the number and the accent color. */
  index: number;
}

function Strip({ project, index }: CardProps) {
  const accent = projectAccent(index);
  return (
    <div
      data-testid="card-strip"
      className={`flex items-center justify-between gap-4 border-b-2 border-ink px-5 py-2 sm:px-6 ${accent.fill}`}
    >
      <span className="label-mono text-ink">{cardNumber(index)}</span>
      {project.period && <span className="label-mono text-ink">{project.period}</span>}
    </div>
  );
}

const cardBase = `flex flex-col border-2 border-ink bg-card ${cardLift.lg}`;

/** A project in the portfolio grid. */
export function ProjectCard({ project: p, index }: CardProps) {
  const accent = projectAccent(index);
  const image = p.images[0];
  return (
    <article
      aria-labelledby={`project-${p.slug}`}
      data-testid="project-card"
      className={`${cardBase} ${accent.shadow}`}
    >
      <Strip project={p} index={index} />
      {image && (
        <img
          src={image.src}
          alt={image.alt}
          loading="lazy"
          className="aspect-video w-full border-b-2 border-ink object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-4 px-5 pt-5 pb-6 sm:px-6">
        <h2 id={`project-${p.slug}`} className="text-2xl font-bold tracking-tight">
          {p.title}
        </h2>
        <p>{p.summary}</p>
        <StackTags items={p.stack} accent={accent} />
        <div className="mt-auto pt-2">
          <ProjectLinks project={p} accent={accent} />
        </div>
      </div>
    </article>
  );
}

/**
 * The featured project: the full width of the grid, with its title in display type and its
 * stack (and image, when it has one) in a themed panel beside the text at desktop.
 */
export function FeaturedProjectCard({ project: p, index }: CardProps) {
  const accent = projectAccent(index);
  const image = p.images[0];
  const hasPanel = Boolean(image) || p.stack.length > 0;
  return (
    <article
      aria-labelledby={`project-${p.slug}`}
      data-testid="featured-project"
      className={`${cardBase} col-span-full ${accent.shadow}`}
    >
      <Strip project={p} index={index} />
      <div className="grid flex-1 lg:grid-cols-12">
        <div
          className={`flex flex-col gap-5 px-5 py-8 sm:px-8 lg:p-10 ${hasPanel ? "lg:col-span-7" : "lg:col-span-12"}`}
        >
          <p className="self-start -rotate-2 border-2 border-ink bg-morro px-3 py-1 font-pixel text-sm text-ink uppercase shadow-block-sm">
            {copy.featured}
          </p>
          <h2
            id={`project-${p.slug}`}
            className="font-display text-3xl tracking-tight break-words sm:text-4xl lg:text-5xl"
          >
            {p.title}
          </h2>
          <p className="text-lg">{p.summary}</p>
          <div className="mt-auto pt-2">
            <ProjectLinks project={p} accent={accent} />
          </div>
        </div>
        {hasPanel && (
          <div
            data-testid="featured-panel"
            className="flex flex-col justify-center gap-6 border-t-2 border-ink bg-serenity px-5 py-8 sm:px-8 lg:col-span-5 lg:border-t-0 lg:border-l-2 lg:p-10"
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
