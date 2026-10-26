import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { experience } from "../../content/experience";
import { projects } from "../../content/projects";
import type { Experience } from "../../content/types";
import { pageThemes } from "../../styles/themes";
import { STAGGER_STEP_MS } from "../motion/motion";
import { ExperienceTimeline } from "./ExperienceTimeline";
import { timelineCardCount } from "./timeline";

function renderTimeline(groups: readonly Experience[] = experience, list = projects) {
  return render(
    <MemoryRouter>
      <ExperienceTimeline groups={groups} projects={list} />
    </MemoryRouter>,
  );
}

const nodes = () => screen.getAllByTestId("experience");
const themeColors = pageThemes.portfolio.shadows.map((s) => s.replace(/^shadow-/, ""));

const group = (over: Partial<Experience>): Experience => ({
  slug: "g",
  organization: "Org from test data",
  role: "Role from test data",
  period: "Jan – Mar 2024",
  start: "2024-01",
  end: "2024-03",
  projects: [],
  ...over,
});

describe("ExperienceTimeline", () => {
  it("is a real ordered list with one item per experience, newest first", () => {
    // Shuffled input: the order comes from `start`, not from the array.
    renderTimeline([experience[2]!, experience[0]!, experience[1]!]);
    const list = nodes()[0]!.parentElement!;
    expect(list.tagName).toBe("OL");
    expect([...list.children].every((c) => c.tagName === "LI")).toBe(true);
    const expected = [...experience]
      .sort((a, b) => (a.start < b.start ? 1 : -1))
      .map((g) => g.organization);
    expect(nodes().map((n) => within(n).getByRole("heading", { level: 3 }).textContent)).toEqual(
      expected.map((o) => expect.stringContaining(o)),
    );
    expect(expected[0]).toBe("Hack4Impact Cal Poly");
  });

  it("shows each experience's organization, role, and exact period text", () => {
    renderTimeline();
    for (const [i, g] of experience.entries()) {
      const node = nodes()[i]!;
      expect(within(node).getByRole("heading", { level: 3 })).toHaveTextContent(g.organization);
      expect(within(node).getByText(g.role)).toBeInTheDocument();
      expect(within(node).getByTestId("experience-period").textContent).toBe(g.period);
    }
  });

  it("marks the start and end dates up as <time> with their ISO values", () => {
    renderTimeline([
      group({ slug: "done", period: "Jul – Aug 2025", start: "2025-07", end: "2025-08-01" }),
      group({ slug: "now", period: "Aug 2026 – Present", start: "2026-08", end: undefined }),
      group({ slug: "odd", period: "Summer 2023", start: "2023-06", end: "2023-08" }),
    ]);
    const times = (n: HTMLElement) =>
      [...within(n).getByTestId("experience-period").querySelectorAll("time")].map((t) => [
        t.textContent,
        t.getAttribute("datetime"),
      ]);
    const [now, done, odd] = nodes();
    expect(times(done!)).toEqual([
      ["Jul", "2025-07"],
      ["Aug 2025", "2025-08-01"],
    ]);
    expect(times(now!)).toEqual([["Aug 2026", "2026-08"]]);
    expect(within(now!).getByTestId("experience-period").textContent).toBe("Aug 2026 – Present");
    // A period that isn't a range is one <time> for its start.
    expect(times(odd!)).toEqual([["Summer 2023", "2023-06"]]);
  });

  it("links the organization in a new tab when it has a link, with a screen-reader hint", () => {
    const withLink = experience.filter((g) => g.link);
    expect(withLink.length).toBeGreaterThan(0);
    renderTimeline([
      ...withLink,
      group({ slug: "nolink", start: "2000-01", link: undefined, organization: "No Link Org" }),
    ]);
    for (const g of withLink) {
      const a = screen.getByRole("link", { name: `${g.organization} (opens in a new tab)` });
      expect(a).toHaveAttribute("href", g.link!.href);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noreferrer");
    }
    const plain = screen.getByRole("heading", { level: 3, name: "No Link Org" });
    expect(within(plain).queryByRole("link")).toBeNull();
  });

  it("renders a logo with its alt text when present, and nothing when absent", () => {
    expect(experience.every((g) => !g.logo)).toBe(true);
    const { unmount } = renderTimeline(experience, []);
    expect(screen.queryByRole("img")).toBeNull();
    unmount();
    const logo = { src: "/logo-from-test.png", alt: "Logo alt from test data" };
    renderTimeline([group({ logo })], []);
    expect(screen.getByRole("img", { name: logo.alt })).toHaveAttribute("src", logo.src);
  });

  it("nests each experience's projects under it, as cards titled one level below", () => {
    renderTimeline();
    for (const [i, g] of experience.entries()) {
      const titles = within(nodes()[i]!)
        .getAllByRole("article")
        .map((a) => within(a).getByRole("heading", { level: 4 }).textContent);
      expect(titles).toEqual(g.projects.map((s) => projects.find((p) => p.slug === s)!.title));
    }
  });

  it("keeps the TAR Syndrome project featured under Develop for Good, with its case study", () => {
    renderTimeline();
    const dfg = nodes().find((n) => n.textContent!.includes("Develop for Good"))!;
    const card = within(dfg).getByTestId("featured-project");
    expect(within(card).getByRole("heading", { level: 4 })).toHaveTextContent(
      "TAR Syndrome Association Website",
    );
    expect(within(card).getByRole("link", { name: /^Case study/ })).toHaveAttribute(
      "href",
      "/portfolio/tar-syndrome-website",
    );
    expect(within(card).getByRole("link", { name: /^Live site/ })).toHaveAttribute(
      "href",
      "https://tar-syndrome-awareness.square.site/",
    );
    expect(screen.getAllByTestId("featured-project")).toHaveLength(1);
  });

  it("gives each node a square marker in a theme color, and cycles card accents across nodes", () => {
    renderTimeline();
    for (const [i, node] of nodes().entries()) {
      const marker = within(node).getByTestId("timeline-marker");
      expect(marker).toHaveAttribute("aria-hidden", "true");
      expect(marker).toHaveClass(`bg-${themeColors[i % themeColors.length]}`);
    }
    const shadows = screen
      .getAllByRole("article")
      .map((a) => [...a.classList].find((c) => c.startsWith("shadow-") && !c.includes("block")));
    expect(shadows).toEqual(shadows.map((_, i) => `shadow-${themeColors[i % themeColors.length]}`));
    expect(timelineCardCount(experience, projects)).toBe(shadows.length);
  });

  it("renders a group with no projects without an empty grid", () => {
    const { container } = renderTimeline([group({ projects: [] })], []);
    expect(container.querySelector(".grid")).toBeNull();
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
  });

  describe("entrance", () => {
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("each node enters in turn, newest first; the cards inside move with their node", () => {
      const animate = vi.fn(() => ({ cancel: vi.fn() }));
      Element.prototype.animate = animate as unknown as Element["animate"];
      renderTimeline();
      expect(nodes()[0]!.parentElement).toHaveAttribute("data-stagger");
      expect(animate.mock.contexts).toEqual(nodes());
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      expect(calls.map(([, o]) => o.delay)).toEqual(nodes().map((_, i) => i * STAGGER_STEP_MS));
    });
  });
});
