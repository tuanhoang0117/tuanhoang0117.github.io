import { ArchiveGrid } from "../components/archive/ArchiveGrid";
import { PageHeader } from "../components/ui/PageHeader";
import { hackathons } from "../content/hackathons";

export function Hackathons() {
  return (
    <>
      <PageHeader title="Hackathons" prompt="Every weekend I spent building." />
      <ArchiveGrid hackathons={hackathons} />
    </>
  );
}
