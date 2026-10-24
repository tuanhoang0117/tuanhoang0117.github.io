import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
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
