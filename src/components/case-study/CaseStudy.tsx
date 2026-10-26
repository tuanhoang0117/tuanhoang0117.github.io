import type { ReactNode } from "react";
import type { CaseStudy as CaseStudyData, Image } from "../../content/types";
import { cardShadow, pageThemes } from "../../styles/themes";
import { Stagger } from "../motion";
import { pad } from "./labels";

const theme = pageThemes.portfolio;

/**
 * Section labels. Content has no field for case-study section headings yet, so each section is
 * labelled with its CaseStudy field name in the mono system voice (`01 — overview`) instead of
 * copy written here. Replace with content fields when the lead adds them.
 */
export type SectionKey =
  "overview" | "problem" | "process" | "images" | "role" | "results" | "tools";

interface Section {
  key: SectionKey;
  body: ReactNode;
  /** Sits on the theme's wash instead of a white card. */
  wash?: boolean;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-poly">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Screenshots({ images }: { images: Image[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {images.map((img, i) => (
        <li key={img.src}>
          <img
            src={img.src}
            alt={img.alt}
            loading="lazy"
            className={`w-full border-2 border-ink bg-card shadow-block ${cardShadow(theme, i + 1)}`}
          />
        </li>
      ))}
    </ul>
  );
}

function sections(study: CaseStudyData, images: Image[]): Section[] {
  const list: (Section | false)[] = [
    { key: "overview", body: <p>{study.overview}</p> },
    { key: "problem", body: <p>{study.problem}</p> },
    study.process.length > 0 && {
      key: "process",
      body: (
        <ol className="space-y-5">
          {study.process.map((step, i) => (
            <li key={step.title} className="grid gap-x-4 gap-y-1 sm:grid-cols-12">
              <span className="label-mono pt-1 text-poly sm:col-span-1" aria-hidden="true">
                {pad(i + 1)}
              </span>
              <div className="sm:col-span-11">
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-1">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      ),
    },
    images.length > 0 && { key: "images", body: <Screenshots images={images} /> },
    (study.role.length > 0 || !!study.reflection) && {
      key: "role",
      wash: true,
      body: (
        <>
          {study.role.length > 0 && <Bullets items={study.role} />}
          {study.reflection && (
            <p data-testid="reflection" className="mt-6 border-l-4 border-poly pl-4 italic">
              {study.reflection}
            </p>
          )}
        </>
      ),
    },
    study.results.length > 0 && { key: "results", body: <Bullets items={study.results} /> },
    study.tools.length > 0 && {
      key: "tools",
      body: (
        <ul className="flex flex-wrap gap-2">
          {study.tools.map((t) => (
            <li key={t} className="border-2 border-ink bg-card px-2 py-1 font-mono text-sm">
              {t}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return list.filter((s): s is Section => !!s);
}

interface CaseStudyProps {
  study: CaseStudyData;
  /** The project's design screenshots. The section is left out when there are none. */
  images: Image[];
}

/** The case study body: one card per section, entering in turn (`<Stagger>`). */
export function CaseStudy({ study, images }: CaseStudyProps) {
  // The outer box matches PageHeader's width and padding so the cards line up under the title.
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
      <Stagger className="max-w-4xl space-y-10">
        {sections(study, images).map((s, i) => (
          <section
            key={s.key}
            aria-labelledby={`case-study-${s.key}`}
            data-section={s.key}
            className={`border-2 border-ink p-6 shadow-block-lg sm:p-8 ${s.wash ? theme.wash : "bg-card"} ${cardShadow(theme, i)}`}
          >
            <h2 id={`case-study-${s.key}`} className="label-mono mb-4 text-poly">
              {pad(i + 1)} — {s.key}
            </h2>
            {s.body}
          </section>
        ))}
      </Stagger>
    </div>
  );
}
