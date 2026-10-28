import { useState } from "react";
import { Link } from "react-router";
import { cardLift } from "../../components/motion/motion";
import { Stagger } from "../../components/motion/Stagger";
import { PageHeader } from "../../components/ui/PageHeader";
import { projects } from "../../content/projects";
import { navLinks } from "../../content/site";
import { cardShadow, pageThemes } from "../../styles/themes";

// Test bench for issue #20: the route transition (navigate away and back), card entrances, and
// the shared hover lift with accent shadows. Real content, so the cards behave like the pages
// that adopt them.

// UI mechanics only.
const copy = { replay: "Replay entrances" };

const sectionLabel = (href: string) => navLinks.find((l) => l.href === href)?.label ?? href;

const demos = [
  {
    href: "/portfolio",
    theme: pageThemes.portfolio,
    cards: projects.map((p) => ({
      key: p.slug,
      to: `/portfolio/${p.slug}`,
      title: p.title,
      meta: p.stack.join(" · "),
    })),
  },
];

export function MotionLab() {
  // Changing the key remounts every Stagger, which replays its entrance.
  const [run, setRun] = useState(0);

  return (
    <>
      <PageHeader title="Motion Lab">
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className={`label-mono mt-6 border-2 border-ink bg-gold-bright px-4 py-2 ${cardLift.sm}`}
        >
          {copy.replay}
        </button>
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-16 sm:px-8">
        {demos.map(({ href, theme, cards }) => {
          const headingId = `motion-${href.slice(1)}`;
          return (
            <section key={href} aria-labelledby={headingId}>
              <h2 id={headingId} className="label-mono text-ink-muted">
                {sectionLabel(href)}
              </h2>
              <Stagger key={run} as="ul" className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((card, i) => (
                  <li key={card.key}>
                    <Link
                      to={card.to}
                      data-testid="motion-card"
                      className={`block h-full border-2 border-ink bg-card p-5 ${cardLift.md} ${cardShadow(theme, i)}`}
                    >
                      <span className="block font-sans text-lg font-semibold">{card.title}</span>
                      <span className="label-mono mt-2 block text-ink-muted">{card.meta}</span>
                    </Link>
                  </li>
                ))}
              </Stagger>
            </section>
          );
        })}
      </div>
    </>
  );
}
