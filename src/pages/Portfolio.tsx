import { ExperienceTimeline } from "../components/portfolio/ExperienceTimeline";
import { timelineCardCount } from "../components/portfolio/timeline";
import { HackathonGrid } from "../components/portfolio/HackathonCard";
import { PortfolioSection } from "../components/portfolio/PortfolioSection";
import { ProjectGrid } from "../components/portfolio/ProjectGrid";
import { PageHeader } from "../components/ui/PageHeader";
import { experience, projectsOutsideExperience } from "../content/experience";
import { hackathons } from "../content/hackathons";
import { portfolioSections } from "../content/portfolio";
import { projects } from "../content/projects";
import { pagePrompts } from "../content/site";

// Accent colors keep cycling from one section's cards into the next.
const hackathonsStart = timelineCardCount(experience, projects);
const projectsStart = hackathonsStart + hackathons.length;

export function Portfolio() {
  const { experience: exp, hackathons: hack, projects: proj } = portfolioSections;
  return (
    <>
      <PageHeader title="Portfolio" prompt={pagePrompts.portfolio} />
      <PortfolioSection id="experience" index={0} heading={exp.heading} prompt={exp.prompt}>
        <ExperienceTimeline groups={experience} projects={projects} />
      </PortfolioSection>
      <PortfolioSection id="hackathons" index={1} heading={hack.heading} prompt={hack.prompt}>
        <HackathonGrid hackathons={hackathons} accentStart={hackathonsStart} />
      </PortfolioSection>
      <PortfolioSection id="projects" index={2} heading={proj.heading} prompt={proj.prompt}>
        <ProjectGrid
          projects={projectsOutsideExperience(projects, experience)}
          accentStart={projectsStart}
          heading="h3"
        />
      </PortfolioSection>
    </>
  );
}
