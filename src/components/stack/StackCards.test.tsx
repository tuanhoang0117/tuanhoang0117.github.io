import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resume } from "../../content/resume";
import { groupSlug } from "./filter";
import { glyphs } from "./glyphs";
import { StackCards } from "./StackCards";

const total = resume.skills.reduce((n, g) => n + g.skills.length, 0);

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderAt(url = "/resume") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StackCards groups={resume.skills} />
      <Search />
    </MemoryRouter>,
  );
}

const filterBar = () => screen.getByRole("group", { name: /filter skills/i });
const filterButtons = () => within(filterBar()).getAllByRole("button");
const cards = () => within(screen.getByRole("list")).queryAllByRole("listitem");
const cardNames = () => cards().map((li) => li.querySelector("p:nth-of-type(2)")!.textContent);
const pressed = () => filterButtons().filter((b) => b.getAttribute("aria-pressed") === "true");
const search = () => screen.getByTestId("search").textContent;

describe("StackCards", () => {
  it("has an All button plus one per group, each with its glyph, label, and count", () => {
    renderAt();
    const buttons = filterButtons();
    expect(buttons).toHaveLength(resume.skills.length + 1);
    expect(buttons[0]).toHaveTextContent(new RegExp(`^All${total}$`));
    resume.skills.forEach((g, i) => {
      const b = buttons[i + 1]!;
      expect(b).toHaveTextContent(`${glyphs[g.glyph].char}${g.label}${g.skills.length}`);
      expect(b.querySelector(`[data-glyph="${g.glyph}"]`)).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("starts on All with every card showing, and exactly one button pressed", () => {
    renderAt();
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toHaveTextContent(/^All/);
    expect(cards()).toHaveLength(total);
  });

  it("renders each card with its glyph, category, name, and deck number", () => {
    renderAt();
    const first = cards()[0]!;
    const g = resume.skills[0]!;
    expect(first).toHaveTextContent(`${glyphs[g.glyph].char}${g.label}${g.skills[0]}#01`);
    expect(cards()[6]).toHaveTextContent(/#07$/);
    expect(cards().at(-1)).toHaveTextContent(new RegExp(`#${total}$`));
  });

  it("shows only the chosen group's cards and removes the rest from the DOM", async () => {
    const user = userEvent.setup();
    renderAt();
    for (const g of resume.skills) {
      await user.click(within(filterBar()).getByRole("button", { name: new RegExp(g.label) }));
      expect(pressed()).toHaveLength(1);
      expect(pressed()[0]).toHaveTextContent(g.label);
      expect(cardNames()).toEqual(g.skills);
      for (const other of resume.skills.filter((o) => o !== g)) {
        for (const s of other.skills.filter((s) => !g.skills.includes(s))) {
          expect(screen.queryByText(s, { exact: true })).toBeNull();
        }
      }
    }
    await user.click(within(filterBar()).getByRole("button", { name: /^All/ }));
    expect(cards()).toHaveLength(total);
  });

  it("writes the filter to ?skills= and clears it for All, keeping other params", async () => {
    const user = userEvent.setup();
    renderAt("/resume?ref=x");
    await user.click(screen.getByRole("button", { name: /Frontend/ }));
    expect(search()).toBe("?ref=x&skills=frontend");
    await user.click(screen.getByRole("button", { name: /Backend & Data/ }));
    expect(search()).toBe("?ref=x&skills=backend-data");
    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(search()).toBe("?ref=x");
  });

  it("reads the filter from ?skills= on load", () => {
    renderAt("/resume?skills=frontend");
    const frontend = resume.skills.find((g) => groupSlug(g.label) === "frontend")!;
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toHaveTextContent(frontend.label);
    expect(cardNames()).toEqual(frontend.skills);
  });

  it("falls back to All for an unknown ?skills= value", () => {
    renderAt("/resume?skills=cobol");
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toHaveTextContent(/^All/);
    expect(cards()).toHaveLength(total);
  });
});

const carousel = () => screen.getByTestId("carousel");
const moving = () => carousel().getAttribute("data-moving");

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("StackCards carousel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves by default and pauses while hovered", () => {
    renderAt();
    expect(moving()).toBe("true");
    fireEvent.mouseEnter(carousel());
    expect(moving()).toBe("false");
    fireEvent.mouseLeave(carousel());
    expect(moving()).toBe("true");
  });

  it("pauses while keyboard focus is inside it, and resumes when focus leaves", () => {
    renderAt();
    expect(moving()).toBe("true");
    const card = cards()[0]!;
    act(() => card.focus());
    expect(moving()).toBe("false");
    act(() => card.blur());
    expect(moving()).toBe("true");
  });

  it("has a pause/play button whose name tracks the state", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole("button", { name: "Pause scrolling" }));
    expect(moving()).toBe("false");
    // Hover ends, but the user's pause stays.
    fireEvent.mouseLeave(carousel());
    expect(moving()).toBe("false");
    await user.click(screen.getByRole("button", { name: "Play scrolling" }));
    expect(moving()).toBe("true");
    expect(screen.queryByRole("button", { name: "Pause scrolling" })).not.toBeNull();
  });

  it("loops with duplicate lists hidden from screen readers and out of the tab order", () => {
    const { container } = renderAt();
    const lists = [...container.querySelectorAll("ul")];
    expect(lists.length).toBeGreaterThanOrEqual(2);
    expect(lists[0]).not.toHaveAttribute("aria-hidden");
    for (const dup of lists.slice(1)) {
      expect(dup).toHaveAttribute("aria-hidden", "true");
      expect(dup.querySelectorAll("li")).toHaveLength(total);
      expect(dup.querySelectorAll("[tabindex]")).toHaveLength(0);
    }
    // Screen readers (and role queries) see each skill once; every real card is a tab stop.
    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(cards()).toHaveLength(total);
    expect(cards().every((li) => li.getAttribute("tabindex") === "0")).toBe(true);
  });

  it("scrolls the row over time, and stops when paused", async () => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const user = userEvent.setup();
    renderAt();
    expect(carousel().scrollLeft).toBe(0);
    act(() => queue.pop()!(performance.now() + 100));
    const after = carousel().scrollLeft;
    expect(after).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Pause scrolling" }));
    queue.length = 0;
    await act(async () => {});
    expect(queue).toHaveLength(0);
    expect(carousel().scrollLeft).toBe(after);
  });

  it("with reduced motion renders one static strip: no button, no copies, no movement", () => {
    stubReducedMotion(true);
    const { container } = renderAt();
    expect(moving()).toBe("false");
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /scrolling/i })).toBeNull();
    expect(cards()).toHaveLength(total);
    expect(carousel().className).toContain("overflow-x-auto");
  });
});
