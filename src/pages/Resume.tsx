import type { ReactNode } from "react";
import { StackCards } from "../components/stack/StackCards";
import { PageHeader } from "../components/ui/PageHeader";
import { resume } from "../content/resume";
import { pagePrompts } from "../content/site";
import type { ResumeEntry } from "../content/types";

function Entry({ entry }: { entry: ResumeEntry }) {
  return (
    <article className="border-l-4 border-poly pl-4">
      <h3 className="text-lg font-bold">{entry.title}</h3>
      {entry.location && <p className="label-mono text-ink-muted">{entry.location}</p>}
      {entry.detail && <p className="mt-1 italic">{entry.detail}</p>}
      {entry.bullets.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-poly">
          {entry.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  const id = title.toLowerCase();
  return (
    <section aria-labelledby={id} className="border-t-2 border-ink py-8">
      <h2 id={id} className="label-mono mb-6 text-poly">
        {n} — {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function Resume() {
  return (
    <>
      <PageHeader title="Resume" prompt={pagePrompts.resume}>
        <a
          href={resume.pdf}
          download="TuanHoang_Resume.pdf"
          className="mt-6 inline-block border-2 border-ink bg-gold-bright px-4 py-2 font-mono text-sm font-bold shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          Download PDF ↓
        </a>
      </PageHeader>
      <div className="mx-auto max-w-3xl px-4 pb-20 sm:px-8">
        <Section n="01" title="Education">
          {resume.education.map((e) => (
            <Entry key={e.title} entry={e} />
          ))}
        </Section>
        <Section n="02" title="Experience">
          {resume.experience.map((e) => (
            <Entry key={e.title} entry={e} />
          ))}
        </Section>
        <Section n="03" title="Projects">
          {resume.projects.map((e) => (
            <Entry key={e.title} entry={e} />
          ))}
        </Section>
        <Section n="04" title="Skills">
          <StackCards groups={resume.skills} />
        </Section>
      </div>
    </>
  );
}
