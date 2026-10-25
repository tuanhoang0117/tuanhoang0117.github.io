import type { Project } from "../../content/types";
import { Stagger } from "../motion";
import { FeaturedProjectCard, ProjectCard } from "./ProjectCard";
import { orderProjects } from "./project";

/**
 * The portfolio grid: the featured project across the full width, then one column at phone
 * width, two on tablets, and three at desktop. Every card is a direct child of one `<Stagger>`,
 * so they enter in reading order.
 */
export function ProjectGrid({ projects }: { projects: readonly Project[] }) {
  return (
    <Stagger className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-20 sm:px-8 md:grid-cols-2 xl:grid-cols-3">
      {orderProjects(projects).map((p, i) =>
        p.featured ? (
          <FeaturedProjectCard key={p.slug} project={p} index={i} />
        ) : (
          <ProjectCard key={p.slug} project={p} index={i} />
        ),
      )}
    </Stagger>
  );
}
