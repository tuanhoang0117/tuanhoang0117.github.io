import { useParams } from "react-router";
import { PageHeader } from "../components/ui/PageHeader";
import { projects } from "../content/projects";
import { NotFound } from "./NotFound";

// Stub. Built out by the case study page issue (#27).
export function ProjectDetail() {
  const { slug } = useParams();
  const project = projects.find((p) => p.slug === slug);
  if (!project) return <NotFound />;

  return <PageHeader title={project.title} prompt={project.summary} />;
}
