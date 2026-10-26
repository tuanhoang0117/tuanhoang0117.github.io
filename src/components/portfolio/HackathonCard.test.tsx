import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { hackathons } from "../../content/hackathons";
import type { Hackathon } from "../../content/types";
import { pageThemes } from "../../styles/themes";
import { HackathonGrid } from "./HackathonCard";

function renderGrid(list: readonly Hackathon[] = hackathons, accentStart = 0) {
  return render(
    <MemoryRouter>
      <HackathonGrid hackathons={list} accentStart={accentStart} />
    </MemoryRouter>,
  );
}

const card = (h: Hackathon) => screen.getByRole("article", { name: h.project });
const themeColors = pageThemes.portfolio.shadows.map((s) => s.replace(/^shadow-/, ""));

describe("HackathonGrid", () => {
  it("shows every hackathon, newest first", () => {
    renderGrid();
    const titles = screen
      .getAllByRole("article")
      .map((a) => within(a).getByRole("heading", { level: 3 }).textContent);
    const byDate = [...hackathons].sort((a, b) => (a.date! < b.date! ? 1 : -1));
    expect(titles).toEqual(byDate.map((h) => h.project));
    expect(titles[0]).toBe("oculusMD");
  });

  it.each(hackathons.map((h) => [h.project, h] as const))(
    "%s: shows its event, summary, my part, stack, and links from content",
    (_, h) => {
      renderGrid();
      const c = card(h);
      expect(within(c).getByText(h.event)).toBeInTheDocument();
      expect(within(c).getByText(h.summary)).toBeInTheDocument();
      expect(within(c).getByTestId("my-part")).toHaveTextContent(`My part — ${h.role}`);
      expect(
        within(c)
          .getAllByTestId("stack-tag")
          .map((t) => t.textContent),
      ).toEqual(h.stack);
      for (const l of h.links) {
        const a = within(c).getByRole("link", { name: `${l.label} (opens in a new tab)` });
        expect(a).toHaveAttribute("href", l.href);
        expect(a).toHaveAttribute("target", "_blank");
      }
      if (h.image) {
        expect(within(c).getByRole("img", { name: h.image.alt })).toHaveAttribute(
          "src",
          h.image.src,
        );
      }
    },
  );

  it("shows a placement only for a win, in the content's words", () => {
    renderGrid();
    const wins = hackathons.filter((h) => h.placement);
    expect(wins.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("placement")).toHaveLength(wins.length);
    for (const h of wins) {
      expect(within(card(h)).getByTestId("placement")).toHaveTextContent(h.placement!);
    }
  });

  it("dates each card with a <time>, and skips the date and image cleanly when absent", () => {
    const bare: Hackathon = {
      ...hackathons[0]!,
      slug: "bare",
      project: "Bare",
      date: undefined,
      image: undefined,
      placement: undefined,
    };
    const { container } = renderGrid([hackathons[1]!, bare]);
    const time = within(card(hackathons[1]!)).getByTestId("card-strip").querySelector("time");
    expect(time).toHaveAttribute("datetime", hackathons[1]!.date);
    expect(within(card(bare)).getByTestId("card-strip").children).toHaveLength(1);
    expect(within(card(bare)).queryByRole("img")).toBeNull();
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
  });

  it("cycles accent shadows, strips, and tags from accentStart", () => {
    renderGrid(hackathons, 2);
    for (const [i, a] of screen.getAllByRole("article").entries()) {
      const color = themeColors[(2 + i) % themeColors.length];
      expect(a).toHaveClass("shadow-block-lg", `shadow-${color}`);
      expect(within(a).getByTestId("card-strip")).toHaveClass(`bg-${color}`);
      for (const tag of within(a).getAllByTestId("stack-tag")) {
        expect(tag).toHaveClass(`border-${color}`);
      }
    }
  });

  it("never links to the archived /hackathons pages, and doesn't stretch cards", () => {
    const { container } = renderGrid();
    expect(container.querySelector('a[href^="/hackathons"]')).toBeNull();
    expect(container.firstElementChild).toHaveClass("items-start");
    expect(container.querySelector(".mt-auto, .flex-1, .h-full")).toBeNull();
  });
});
