import { PageHeader } from "../components/ui/PageHeader";
import { hackathons } from "../content/hackathons";
import { projects } from "../content/projects";
import type { Link, Tint } from "../content/types";

const tintBg: Record<Tint, string> = {
  peach: "bg-tint-peach",
  butter: "bg-tint-butter",
  mint: "bg-tint-mint",
  sky: "bg-tint-sky",
  lilac: "bg-tint-lilac",
};

function Links({ links }: { links: Link[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-3">
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="label-mono underline decoration-2 underline-offset-4 hover:text-poly"
          >
            {l.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function Stack({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <li key={s} className="border border-ink bg-card px-1.5 py-0.5 font-mono text-xs">
          {s}
        </li>
      ))}
    </ul>
  );
}

// Rough port of v1. Rebuilt as the hackathon archive and project pages in Sprint 1.
export function Portfolio() {
  return (
    <>
      <PageHeader title="Portfolio" prompt="Things I've built." />

      <section aria-labelledby="hackathons" className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <h2 id="hackathons" className="label-mono mb-6 text-poly">
          01 — Hackathons
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          {hackathons.map((h) => (
            <article
              key={h.slug}
              className={`border-2 border-ink p-5 shadow-block ${tintBg[h.tint]}`}
            >
              <p className="label-mono text-ink-muted">{h.event}</p>
              <h3 className="mt-1 text-2xl font-bold">{h.project}</h3>
              {h.placement && (
                <p className="mt-2 inline-block bg-ink px-2 py-0.5 label-mono text-paper">
                  ★ {h.placement}
                </p>
              )}
              {h.image && (
                <img
                  src={h.image.src}
                  alt={h.image.alt}
                  loading="lazy"
                  className="mt-4 aspect-video w-full border-2 border-ink object-cover"
                />
              )}
              <p className="mt-4">{h.summary}</p>
              <p className="mt-3">
                <span className="label-mono text-poly">My part — </span>
                {h.role}
              </p>
              <Stack items={h.stack} />
              <Links links={h.links} />
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="projects" className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <h2 id="projects" className="label-mono mb-6 text-poly">
          02 — Projects
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          {projects.map((p) => (
            <article key={p.slug} className="border-2 border-ink bg-card p-5 shadow-block">
              <h3 className="text-2xl font-bold">{p.title}</h3>
              {p.images[0] && (
                <img
                  src={p.images[0].src}
                  alt={p.images[0].alt}
                  loading="lazy"
                  className="mt-4 aspect-video w-full border-2 border-ink object-cover"
                />
              )}
              <p className="mt-4">{p.summary}</p>
              <Stack items={p.stack} />
              <Links links={p.links} />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
