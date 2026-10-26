import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { experience } from "../../content/experience";
import { hackathons } from "../../content/hackathons";
import { portfolioSections } from "../../content/portfolio";
import { projects } from "../../content/projects";
import { Portfolio } from "../../pages/Portfolio";

function renderPage() {
  return render(
    <MemoryRouter>
      <Portfolio />
    </MemoryRouter>,
  );
}

const section = (id: string) => screen.getByTestId(`section-${id}`);
const order = ["experience", "hackathons", "projects"] as const;

describe("Portfolio page", () => {
  it("has three sections in order, headed and prompted from src/content/portfolio.ts", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(
      order.map((k) => expect.stringContaining(portfolioSections[k].heading)),
    );
    for (const k of order) {
      const s = section(k);
      expect(s.tagName).toBe("SECTION");
      expect(s).toHaveAccessibleName(expect.stringContaining(portfolioSections[k].heading));
      expect(within(s).getByText(portfolioSections[k].prompt)).toHaveClass("prompt");
    }
  });

  it("shows each project exactly once: under its experience, or else in Projects", () => {
    renderPage();
    const titlesIn = (id: string) =>
      within(section(id))
        .queryAllByRole("article")
        .map((a) => within(a).getAllByRole("heading")[0]!.textContent);
    const underExperience = experience.flatMap((g) => g.projects);
    const title = (slug: string) => projects.find((p) => p.slug === slug)!.title;
    expect(titlesIn("experience")).toEqual(underExperience.map(title));
    expect(titlesIn("projects")).toEqual(
      projects.filter((p) => !underExperience.includes(p.slug)).map((p) => p.title),
    );
    expect(titlesIn("projects").length).toBeGreaterThan(0);
    expect(new Set([...titlesIn("experience"), ...titlesIn("projects")]).size).toBe(
      projects.length,
    );
  });

  it("keeps every hackathon on the page, in the Hackathons section", () => {
    renderPage();
    const titles = within(section("hackathons"))
      .getAllByRole("article")
      .map((a) => within(a).getByRole("heading", { level: 3 }).textContent);
    expect(titles.toSorted()).toEqual(hackathons.map((h) => h.project).toSorted());
  });

  it("keeps accents cycling across sections: no two consecutive cards share a color", () => {
    const { container } = renderPage();
    const colors = [...container.querySelectorAll("article")].map((a) =>
      [...a.classList].find((c) => c.startsWith("shadow-") && !c.startsWith("shadow-block")),
    );
    expect(colors.every(Boolean)).toBe(true);
    for (let i = 1; i < colors.length; i++) expect(colors[i]).not.toBe(colors[i - 1]);
  });

  describe("entrance", () => {
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("each section's list starts its own entrance at delay 0", () => {
      const animate = vi.fn(() => ({ cancel: vi.fn() }));
      Element.prototype.animate = animate as unknown as Element["animate"];
      const { container } = renderPage();
      const lists = [...container.querySelectorAll("[data-stagger]")];
      expect(lists).toHaveLength(3);
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      for (const list of lists) {
        const delays = animate.mock.contexts.flatMap((el, i) =>
          (el as Element).parentElement === list ? [calls[i]![1].delay] : [],
        );
        expect(delays.length).toBe(list.children.length);
        expect(delays[0]).toBe(0);
      }
    });
  });
});
