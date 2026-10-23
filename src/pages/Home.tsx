import { Link } from "react-router";
import { PageHeader } from "../components/ui/PageHeader";
import { site } from "../content/site";

// Placeholder until the story chapters land (Sprint 2).
export function Home() {
  return (
    <>
      <PageHeader title={site.name} prompt="Computer science student at Cal Poly SLO." />
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 sm:grid-cols-[auto_1fr] sm:px-8">
        <img
          src="/profile.jpg"
          alt="Tuan Hoang"
          width={224}
          height={224}
          className="size-56 border-2 border-ink object-cover shadow-block"
        />
        <div className="max-w-prose space-y-4">
          <p className="label-mono text-poly">Chapter 00 — under construction</p>
          <p className="text-lg">
            I'm a third-year computer science student. I build things at hackathons, play
            volleyball, and play video games.
          </p>
          <Link
            to="/portfolio"
            className="inline-block border-2 border-ink bg-gold-bright px-4 py-2 font-mono text-sm font-bold shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            See my work →
          </Link>
        </div>
      </section>
    </>
  );
}
