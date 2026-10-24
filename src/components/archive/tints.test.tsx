import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Hackathon, Tint } from "../../content/types";
import { ArchiveColumn } from "./ArchiveColumn";
import { tintStyles } from "./tints";

// The mapping issue #4 specifies, written out so a change to tints.ts has to be deliberate.
const spec: Record<Tint, string> = {
  peach: "glyph-orange",
  butter: "gold",
  mint: "poly-bright",
  sky: "glyph-blue",
  lilac: "glyph-purple",
};

describe("tintStyles", () => {
  it.each(Object.entries(spec))("%s maps to its own wash and the %s accent", (tint, accent) => {
    const style = tintStyles[tint as Tint];
    expect(style.column).toBe(`bg-tint-${tint}`);
    expect(style.accentBg).toBe(`bg-${accent}`);
    expect(style.accentText).toBe(`text-${accent}`);
  });

  it.each(Object.keys(spec))("a %s column uses its wash and accent block", (tint) => {
    const h: Hackathon = {
      slug: "x",
      project: "X",
      event: "E",
      summary: "s",
      role: "r",
      stack: [],
      links: [],
      tint: tint as Tint,
      image: { src: "https://example.com/x.png", alt: "x" },
    };
    const { container } = render(
      <MemoryRouter>
        <ArchiveColumn hackathon={h} index={0} />
      </MemoryRouter>,
    );
    const style = tintStyles[tint as Tint];
    expect(screen.getByRole("article")).toHaveClass(style.column);
    expect(container.getElementsByClassName(style.accentBg)).toHaveLength(1);
  });
});
