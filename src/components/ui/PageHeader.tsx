import { useEffect, useRef, type ReactNode } from "react";
import { shimmerStyle, useShimmer } from "../brand/shimmer";
import { site } from "../../content/site";

interface PageHeaderProps {
  /** Shown as giant display type with the home title's shimmer. Also sets the document title. */
  title: string;
  /** Terminal-prompt subtitle, rendered as ">>> text". */
  prompt?: string;
  children?: ReactNode;
}

const TITLE = "font-display text-display tracking-tight uppercase";

export function PageHeader({ title, prompt, children }: PageHeaderProps) {
  useEffect(() => {
    document.title = title === site.name ? site.name : `${title} · ${site.name}`;
  }, [title]);

  const shimmer = useRef<HTMLDivElement>(null);
  useShimmer(shimmer);

  return (
    <header className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-8 sm:pt-20">
      {/* The heading stays plain ink text, heard once. The shimmer is an aria-hidden copy laid
          over it with the same type, so it wraps the same way, outside the h1 so its text stays
          the title alone. */}
      <div className="relative">
        <h1 className={`${TITLE} text-ink`}>{title}</h1>
        <div
          ref={shimmer}
          aria-hidden="true"
          data-shimmer=""
          className={`${TITLE} pointer-events-none absolute inset-0 bg-clip-text text-transparent select-none`}
          style={shimmerStyle}
        >
          {title}
        </div>
      </div>
      {prompt && <p className="prompt mt-4 text-sm sm:text-base">{prompt}</p>}
      {children}
    </header>
  );
}
