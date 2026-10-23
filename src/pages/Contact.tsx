import { PageHeader } from "../components/ui/PageHeader";
import { socials } from "../content/site";

// Placeholder. The signup-style contact card is a Sprint 1 issue; form backend is undecided.
export function Contact() {
  return (
    <>
      <PageHeader title="Contact" prompt="Feel free to reach out." />
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <ul className="flex flex-col gap-3 sm:flex-row">
          {socials.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                className="block border-2 border-ink bg-card px-5 py-3 font-mono text-sm font-bold shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                {...(s.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {s.label} →
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
