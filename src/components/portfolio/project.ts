import type { Project } from "../../content/types";

/** The featured project first, then the rest in content order (newest first). */
export function orderProjects(projects: readonly Project[]): Project[] {
  return [...projects.filter((p) => p.featured), ...projects.filter((p) => !p.featured)];
}

/** The in-app case-study page for a project that has one. */
export function caseStudyHref(project: Project): string | undefined {
  return project.caseStudy ? `/portfolio/${project.slug}` : undefined;
}
