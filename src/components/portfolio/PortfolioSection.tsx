import type { ReactNode } from "react";
import { cardNumber } from "./accents";

interface PortfolioSectionProps {
  id: string;
  /** Position on the page, 0-based: the "01" before the heading. */
  index: number;
  heading: string;
  prompt: string;
  children: ReactNode;
}

/** One of the portfolio page's sections: a numbered heading, its ">>>" line, then its content. */
export function PortfolioSection({ id, index, heading, prompt, children }: PortfolioSectionProps) {
  const headingId = `section-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={`section-${id}`}
      className="mx-auto max-w-6xl px-4 pb-20 sm:px-8"
    >
      <h2 id={headingId} className="flex items-baseline gap-3 text-3xl font-bold tracking-tight">
        <span aria-hidden="true" className="label-mono text-poly">
          {cardNumber(index)} —
        </span>
        {heading}
      </h2>
      <p className="prompt mt-2 mb-10 text-sm sm:text-base">{prompt}</p>
      {children}
    </section>
  );
}
