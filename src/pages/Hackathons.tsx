import { ArchiveGrid } from "../components/archive/ArchiveGrid";
import { PageHeader } from "../components/ui/PageHeader";
import { hackathons } from "../content/hackathons";
import { pagePrompts } from "../content/site";

export function Hackathons() {
  return (
    <>
      <PageHeader title="Hackathons" prompt={pagePrompts.hackathons} />
      <ArchiveGrid hackathons={hackathons} />
    </>
  );
}
