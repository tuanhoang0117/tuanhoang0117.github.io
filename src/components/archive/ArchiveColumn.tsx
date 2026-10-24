import { Link } from "react-router";
import type { Hackathon } from "../../content/types";
import { EventImage } from "./EventImage";
import { formatDateLabel, statsLine, stripLabel } from "./format";
import { tintStyles } from "./tints";

interface ArchiveColumnProps {
  hackathon: Hackathon;
  /** Position in the archive, 0-based. Drives the numbered strip. */
  index: number;
}

export function ArchiveColumn({ hackathon: h, index }: ArchiveColumnProps) {
  const dateLabel = formatDateLabel(h.date);
  const stats = statsLine(h.stats);

  return (
    <article
      aria-labelledby={`hackathon-${h.slug}`}
      className={`flex flex-col border-2 border-ink ${tintStyles[h.tint].column}`}
    >
      <div className="relative px-5 pt-6 sm:px-6">
        <EventImage image={h.image} tint={h.tint} seed={h.slug} />
        {h.placement && (
          <p
            data-testid="winner-sticker"
            className="absolute -top-2 right-3 -rotate-6 border-2 border-ink bg-gold-bright px-3 py-1 font-pixel text-sm text-ink uppercase shadow-block-sm"
          >
            Winner
            <span className="sr-only">: {h.placement}</span>
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pt-5 pb-6 sm:px-6">
        {dateLabel && (
          <p className="label-mono text-ink-muted">
            <time dateTime={h.date}>{dateLabel}</time>
          </p>
        )}
        <h2
          id={`hackathon-${h.slug}`}
          className="mt-2 font-display text-4xl tracking-tight break-words sm:text-5xl"
        >
          {h.project}
        </h2>
        <p className="mt-2 text-lg font-semibold">{h.event}</p>
        {stats && <p className="mt-3 font-mono text-sm text-ink-muted">{stats}</p>}

        <Link
          to={`/hackathons/${h.slug}`}
          aria-label={`Open event: ${h.project}`}
          className="mt-6 self-start border-2 border-ink bg-card px-4 py-2 text-sm font-semibold shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          Open event →
        </Link>
      </div>

      <p className="label-mono mt-auto border-t-2 border-ink bg-ink px-5 py-2 text-paper sm:px-6">
        {stripLabel(index, h.project)}
      </p>
    </article>
  );
}
