import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projects } from "../../content/projects";
import type { Project } from "../../content/types";
import { pageThemes } from "../../styles/themes";
import { STAGGER_STEP_MS } from "../motion/motion";
import { projectAccent } from "./accents";
import { orderProjects } from "./project";
import { ProjectGrid } from "./ProjectGrid";

function renderGrid(list: readonly Project[] = projects) {
  return render(
    <MemoryRouter>
      <ProjectGrid projects={list} />
    </MemoryRouter>,
  );
}

const featured = projects.find((p) => p.featured)!;

const plain: Project = {
  slug: "plain",
  title: "Plain Project",
  summary: "A summary from test data.",
  stack: ["Tool A", "Tool B"],
  images: [],
  links: [{ label: "Repo link", href: "https://example.com/plain" }],
};

describe("ProjectGrid", () => {
  it("renders one card per project, the featured project first", () => {
    renderGrid();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(projects.length);
    expect(cards[0]).toHaveAttribute("data-testid", "featured-project");
    expect(within(cards[0]!).getByRole("heading", { level: 2 })).toHaveTextContent(featured.title);
    expect(screen.getAllByTestId("featured-project")).toHaveLength(1);
    const rest = projects.filter((p) => !p.featured).map((p) => p.title);
    expect(cards.slice(1).map((c) => within(c).getByRole("heading").textContent)).toEqual(rest);
  });

  it("the featured card links to the DFG live site and to its case-study page", () => {
    // The Develop for Good project is the featured one (content-schema: exactly one featured).
    expect(featured.slug).toBe("tar-syndrome-website");
    renderGrid();
    const card = screen.getByTestId("featured-project");
    const caseStudy = within(card).getByRole("link", { name: /^Case study/ });
    expect(caseStudy).toHaveAttribute("href", "/portfolio/tar-syndrome-website");
    expect(caseStudy).not.toHaveAttribute("target");
    for (const l of featured.links) {
      const a = within(card).getByRole("link", { name: new RegExp(`^${l.label}`) });
      expect(a).toHaveAttribute("href", l.href);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAccessibleName(`${l.label} (opens in a new tab)`);
    }
    expect(within(card).getAllByRole("link")).toHaveLength(featured.links.length + 1);
  });

  it("gives every card a large accent block shadow from the Portfolio theme, cycling by position", () => {
    renderGrid();
    const shadows = pageThemes.portfolio.shadows;
    const cards = screen.getAllByRole("article");
    for (const [i, card] of cards.entries()) {
      expect(card).toHaveClass("shadow-block-lg", shadows[i % shadows.length]!);
    }
    expect(
      new Set(cards.map((c) => [...c.classList].find((k) => shadows.includes(k as never)))),
    ).toHaveLength(Math.min(shadows.length, cards.length));
  });

  it("colors each card's strip and stack tags from its theme accent", () => {
    renderGrid();
    for (const [i, card] of screen.getAllByRole("article").entries()) {
      const accent = projectAccent(i);
      expect(within(card).getByTestId("card-strip")).toHaveClass(accent.fill);
      for (const tag of within(card).getAllByTestId("stack-tag")) {
        expect(tag).toHaveClass(accent.border);
      }
    }
  });

  it("renders a card's text, tags, and links only from its content data", () => {
    renderGrid([plain]);
    const card = screen.getByRole("article", { name: plain.title });
    expect(within(card).getByText(plain.summary)).toBeInTheDocument();
    expect(
      within(card)
        .getAllByTestId("stack-tag")
        .map((t) => t.textContent),
    ).toEqual(plain.stack);
    expect(within(card).getByRole("link", { name: /^Repo link/ })).toHaveAttribute(
      "href",
      plain.links[0]!.href,
    );
  });

  it("skips images, the case-study link, and the period cleanly when content has none", () => {
    const { container } = renderGrid([plain, { ...plain, slug: "f", title: "F", featured: true }]);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link", { name: /^Case study/ })).toBeNull();
    for (const strip of screen.getAllByTestId("card-strip")) {
      expect(strip.children).toHaveLength(1);
    }
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
  });

  it("renders a project's first image with its alt text when it has images", () => {
    const image = { src: "https://example.com/a.png", alt: "Alt text from test data" };
    renderGrid([
      { ...plain, images: [image, { src: "https://example.com/b.png", alt: "Second" }] },
      { ...plain, slug: "f", title: "F", featured: true, images: [image] },
    ]);
    const imgs = screen.getAllByRole("img", { name: image.alt });
    expect(imgs).toHaveLength(2);
    for (const img of imgs) expect(img).toHaveAttribute("src", image.src);
    expect(screen.queryByRole("img", { name: "Second" })).toBeNull();
  });

  it("the real DFG project has no images, so its card renders none", () => {
    expect(featured.images).toEqual([]);
    renderGrid();
    expect(within(screen.getByTestId("featured-project")).queryByRole("img")).toBeNull();
  });

  describe("entrance", () => {
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("staggers every card's entrance in reading order, one step apart", () => {
      // jsdom has no Web Animations API; record which elements animate, and when.
      const animate = vi.fn(() => ({ cancel: vi.fn() }));
      Element.prototype.animate = animate as unknown as Element["animate"];
      const { container } = renderGrid();
      const cards = screen.getAllByRole("article");
      expect(container.firstElementChild).toHaveAttribute("data-stagger");
      expect([...container.firstElementChild!.children]).toEqual(cards);
      expect(animate.mock.contexts).toEqual(cards);
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      expect(calls.map(([, o]) => o.delay)).toEqual(
        cards.map((_, i) => Math.min(i, 8) * STAGGER_STEP_MS),
      );
    });
  });
});

describe("orderProjects", () => {
  it("puts featured projects first and keeps content order otherwise", () => {
    const a = { ...plain, slug: "a" };
    const b = { ...plain, slug: "b", featured: true };
    const c = { ...plain, slug: "c" };
    expect(orderProjects([a, b, c]).map((p) => p.slug)).toEqual(["b", "a", "c"]);
  });
});
