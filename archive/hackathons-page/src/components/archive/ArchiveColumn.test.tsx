import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGGER_STEP_MS } from "../motion/motion";
import type { Hackathon } from "../../content/types";
import { pageThemes } from "../../styles/themes";
import { ArchiveColumn } from "./ArchiveColumn";
import { ArchiveGrid } from "./ArchiveGrid";

const base: Hackathon = {
  slug: "ace",
  project: "ACE",
  event: "HackHayward 2026",
  summary: "s",
  role: "r",
  stack: [],
  links: [],
  tint: "sky",
};

const full: Hackathon = {
  ...base,
  date: "2026-03-21",
  placement: "Winner, Best Beginner Project",
  stats: { teamSize: 4, hours: 24 },
  image: { src: "https://example.com/ace.png", alt: "ACE stat-tracking app" },
};

function renderColumn(h: Hackathon, index = 0) {
  return render(
    <MemoryRouter>
      <ArchiveColumn hackathon={h} index={index} />
    </MemoryRouter>,
  );
}

describe("ArchiveColumn", () => {
  it("renders a complete column from full data", () => {
    renderColumn(full);
    const column = screen.getByRole("article", { name: "ACE" });
    expect(within(column).getByRole("heading", { level: 2 })).toHaveTextContent("ACE");
    expect(within(column).getByText("HackHayward 2026")).toBeInTheDocument();
    expect(within(column).getByText("MAR 2026")).toBeInTheDocument();
    expect(within(column).getByText("team of 4 · 24 hours")).toBeInTheDocument();
    expect(within(column).getByRole("img", { name: "ACE stat-tracking app" })).toHaveAttribute(
      "src",
      "https://example.com/ace.png",
    );
    expect(within(column).queryByTestId("image-placeholder")).toBeNull();
    expect(within(column).getByTestId("winner-sticker")).toHaveTextContent(/^Winner/);
    expect(within(column).getByText("01 ACE")).toBeInTheDocument();
  });

  it("takes its shadow color from the Hackathons theme, cycling by position", () => {
    const shadows = pageThemes.hackathons.shadows;
    renderColumn(full, 0);
    expect(screen.getByRole("article")).toHaveClass("shadow-block-lg", shadows[0]);
    renderColumn({ ...full, slug: "b", project: "B" }, shadows.length + 1);
    expect(screen.getByRole("article", { name: "B" })).toHaveClass(shadows[1]);
  });

  it("links to the event's detail page", () => {
    renderColumn(full);
    expect(screen.getByRole("link", { name: /open event/i })).toHaveAttribute(
      "href",
      "/hackathons/ace",
    );
  });

  it("shows a pixel placeholder, not an <img>, when there's no image", () => {
    renderColumn(base);
    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("swaps to the placeholder when the image fails to load", () => {
    renderColumn(full);
    fireEvent.error(screen.getByRole("img", { name: "ACE stat-tracking app" }));
    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it.each([
    ["no stats", undefined],
    ["zero stats", { teamSize: 0, hours: 0 }],
  ])("renders cleanly from minimal data with %s: no date, sticker, or stray values", (_, stats) => {
    const { container } = renderColumn({ ...base, stats });
    expect(container.querySelector("time")).toBeNull();
    expect(screen.queryByTestId("winner-sticker")).toBeNull();
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
    // The only numbers are the event name's year and the strip's "01"; a stray 0 stat would add one.
    expect(container.textContent!.match(/\d+/g)).toEqual(["2026", "01"]);
  });

  it("shows the winner sticker only when the event placed", () => {
    renderColumn(full);
    expect(screen.getByTestId("winner-sticker")).toHaveTextContent(full.placement!);
    renderColumn({ ...full, slug: "other", project: "Other", placement: undefined });
    expect(screen.getAllByTestId("winner-sticker")).toHaveLength(1);
  });
});

describe("ArchiveGrid", () => {
  it("renders one column per hackathon, newest first, numbered in that order", () => {
    render(
      <MemoryRouter>
        <ArchiveGrid
          hackathons={[
            { ...base, slug: "undated", project: "Undated" },
            { ...base, slug: "old", project: "Old", date: "2024-01" },
            { ...base, slug: "new", project: "New", date: "2026-02-01" },
          ]}
        />
      </MemoryRouter>,
    );
    const columns = screen.getAllByRole("article");
    expect(columns.map((c) => within(c).getByRole("heading").textContent)).toEqual([
      "New",
      "Old",
      "Undated",
    ]);
    expect(columns.map((c) => c.lastElementChild!.textContent)).toEqual([
      "01 NEW",
      "02 OLD",
      "03 UNDATED",
    ]);
  });

  describe("entrance", () => {
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("staggers the columns' entrance in grid order, one step apart", () => {
      // jsdom has no Web Animations API; record which elements animate, and when.
      const animate = vi.fn(() => ({ cancel: vi.fn() }));
      Element.prototype.animate = animate as unknown as Element["animate"];
      const { container } = render(
        <MemoryRouter>
          <ArchiveGrid
            hackathons={[
              { ...base, slug: "a", project: "A", date: "2026-03" },
              { ...base, slug: "b", project: "B", date: "2026-02" },
              { ...base, slug: "c", project: "C", date: "2026-01" },
            ]}
          />
        </MemoryRouter>,
      );
      const columns = screen.getAllByRole("article");
      expect(container.firstElementChild).toHaveAttribute("data-stagger");
      expect([...container.firstElementChild!.children]).toEqual(columns);
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      expect(animate.mock.contexts).toEqual(columns);
      expect(calls.map(([, o]) => o.delay)).toEqual([0, 1, 2].map((i) => i * STAGGER_STEP_MS));
    });
  });
});
