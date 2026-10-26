import type { Project } from "../../content/types";
import { Stagger } from "../motion";
import { type CardHeading, FeaturedProjectCard, ProjectCard } from "./ProjectCard";
import { orderProjects } from "./project";

interface ProjectCardsProps {
  projects: readonly Project[];
  /** The page-wide accent position of the first card, so colors keep cycling across sections. */
  accentStart?: number;
  heading: CardHeading;
  /** Show each project's period on its strip. */
  showPeriod?: boolean;
}

function cards(
  { projects, accentStart = 0, heading, showPeriod = true }: ProjectCardsProps,
  extra = "",
) {
  return orderProjects(projects).map((p, i) => {
    const props = { project: p, accentIndex: accentStart + i, number: i, heading, showPeriod };
    return p.featured ? (
      <FeaturedProjectCard key={p.slug} {...props} />
    ) : (
      <ProjectCard key={p.slug} {...props} className={extra} />
    );
  });
}

// `items-start`: each card is as tall as its own content, never stretched to its row.
const grid = "grid grid-cols-1 items-start gap-8";

/**
 * The Projects section: one column at phone width, two on tablets, three at desktop. At two
 * columns an odd last card spans the row instead of leaving half of it empty. Every card is a
 * direct child of one `<Stagger>`, so they enter in reading order.
 */
export function ProjectGrid(props: ProjectCardsProps) {
  return (
    <Stagger className={`${grid} md:grid-cols-2 xl:grid-cols-3`}>
      {cards(props, "md:max-xl:last:odd:col-span-2")}
    </Stagger>
  );
}

/**
 * The projects built under one experience, inside its timeline node: two columns from tablets
 * up when it has more than one, the featured project across the full width. The node itself
 * is what enters, so this grid has no entrance of its own.
 */
export function GroupProjects(props: ProjectCardsProps) {
  const cols = props.projects.length > 1 ? "md:grid-cols-2" : "";
  return <div className={`${grid} ${cols}`}>{cards(props)}</div>;
}
