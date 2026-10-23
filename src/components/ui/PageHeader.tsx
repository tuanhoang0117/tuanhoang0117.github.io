import { useEffect, type ReactNode } from "react";
import { site } from "../../content/site";

interface PageHeaderProps {
  /** Shown as giant outlined display type. Also sets the document title. */
  title: string;
  /** Terminal-prompt subtitle, rendered as ">>> text". */
  prompt?: string;
  children?: ReactNode;
}

export function PageHeader({ title, prompt, children }: PageHeaderProps) {
  useEffect(() => {
    document.title = title === site.name ? site.name : `${title} · ${site.name}`;
  }, [title]);

  return (
    <header className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-8 sm:pt-20">
      <h1 className="font-display text-outline text-6xl leading-[0.9] tracking-tight uppercase sm:text-8xl">
        {title}
      </h1>
      {prompt && <p className="prompt mt-4 text-sm sm:text-base">{prompt}</p>}
      {children}
    </header>
  );
}
