import { ProjectGrid } from "../components/portfolio/ProjectGrid";
import { PageHeader } from "../components/ui/PageHeader";
import { projects } from "../content/projects";
import { pagePrompts } from "../content/site";

export function Portfolio() {
  return (
    <>
      <PageHeader title="Portfolio" prompt={pagePrompts.portfolio} />
      <ProjectGrid projects={projects} />
    </>
  );
}
