import { useParams } from "react-router";
import { CaseStudy } from "../components/case-study/CaseStudy";
import { CaseStudyLinks } from "../components/case-study/CaseStudyLinks";
import { PageHeader } from "../components/ui/PageHeader";
import { projects } from "../content/projects";
import { NotFound } from "./NotFound";

export function ProjectDetail() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);
  if (!project) return <NotFound />;

  const study = project.caseStudy;

  return (
    <>
      <PageHeader title={project.title} prompt={project.period}>
        {!study && <p className="mt-6 max-w-3xl text-lg">{project.summary}</p>}
        <CaseStudyLinks links={project.links} pdf={study?.pdf} />
      </PageHeader>
      {study && <CaseStudy study={study} images={project.images} />}
    </>
  );
}
