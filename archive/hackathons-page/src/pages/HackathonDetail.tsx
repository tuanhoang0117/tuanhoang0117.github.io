import { useParams } from "react-router";
import { PageHeader } from "../components/ui/PageHeader";
import { hackathons } from "../content/hackathons";
import { NotFound } from "./NotFound";

// Stub. Built out by the hackathon detail page issue (Sprint 2).
export function HackathonDetail() {
  const { slug } = useParams();
  const hackathon = hackathons.find((h) => h.slug === slug);
  if (!hackathon) return <NotFound />;

  return <PageHeader title={hackathon.project} prompt={hackathon.event} />;
}
