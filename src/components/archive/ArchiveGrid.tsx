import type { Hackathon } from "../../content/types";
import { Stagger } from "../motion";
import { ArchiveColumn } from "./ArchiveColumn";
import { sortHackathons } from "./format";

export function ArchiveGrid({ hackathons }: { hackathons: readonly Hackathon[] }) {
  return (
    <Stagger className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pb-16 sm:px-8 md:grid-cols-2 xl:grid-cols-4">
      {sortHackathons(hackathons).map((h, i) => (
        <ArchiveColumn key={h.slug} hackathon={h} index={i} />
      ))}
    </Stagger>
  );
}
