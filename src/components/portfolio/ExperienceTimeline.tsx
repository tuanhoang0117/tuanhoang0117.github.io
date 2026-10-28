import type { Experience, Project } from "../../content/types";
import { Stagger } from "../motion";
import { projectAccent } from "./accents";
import { periodParts } from "./dates";
import { GroupProjects } from "./ProjectGrid";
import { NewTabHint } from "./ProjectParts";
import { timelineNodes } from "./timeline";

function Organization({ group }: { group: Experience }) {
  if (!group.link) return group.organization;
  return (
    <a
      href={group.link.href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-2 underline-offset-4 hover:text-poly"
    >
      {group.organization} <NewTabHint />
    </a>
  );
}

function Period({ group }: { group: Experience }) {
  return (
    <p data-testid="experience-period" className="label-mono mt-1 text-ink-muted">
      {periodParts(group).map((part, i) =>
        part.dateTime ? (
          <time key={i} dateTime={part.dateTime}>
            {part.text}
          </time>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

interface ExperienceTimelineProps {
  groups: readonly Experience[];
  projects: readonly Project[];
  /** The page-wide accent position of the first project card. */
  accentStart?: number;
}

/**
 * The Experience section: a vertical timeline, newest first. Each experience is a node on the
 * line (a square marker in its accent color) with its organization, role, and dates, and the
 * projects built under it nested below as cards. The line runs down the left edge at every
 * width, so the timeline is a single column on phones. Each node enters in turn.
 */
export function ExperienceTimeline({ groups, projects, accentStart = 0 }: ExperienceTimelineProps) {
  return (
    <Stagger as="ol" className="ml-2 border-l-4 border-morro">
      {timelineNodes(groups, projects, accentStart).map(
        ({ group, projects: own, accentStart: start }, i) => (
          <li
            key={group.slug}
            aria-labelledby={`experience-${group.slug}`}
            data-testid="experience"
            className="relative pb-16 pl-6 last:pb-0 sm:pl-10"
          >
            <span
              aria-hidden="true"
              data-testid="timeline-marker"
              className={`absolute top-1.5 -left-3 size-5 border-2 border-ink ${projectAccent(i).fill}`}
            />
            <div className="flex items-start gap-4">
              {group.logo && (
                <img
                  src={group.logo.src}
                  alt={group.logo.alt}
                  className="size-12 shrink-0 border-2 border-ink bg-card object-contain"
                />
              )}
              <div>
                <h3
                  id={`experience-${group.slug}`}
                  className="text-2xl font-bold tracking-tight break-words"
                >
                  <Organization group={group} />
                </h3>
                <p className="mt-1 font-semibold">{group.role}</p>
                <Period group={group} />
              </div>
            </div>
            {own.length > 0 && (
              <div className="mt-6">
                <GroupProjects projects={own} accentStart={start} heading="h4" showPeriod={false} />
              </div>
            )}
          </li>
        ),
      )}
    </Stagger>
  );
}
