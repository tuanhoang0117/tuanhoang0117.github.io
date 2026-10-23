import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { navLinks } from "../../content/site";
import { Nav } from "./Nav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
    </MemoryRouter>,
  );
}

describe("Nav", () => {
  it("renders every nav link", () => {
    renderAt("/");
    for (const link of navLinks) {
      expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
    }
  });

  it("marks only the current page as active", () => {
    renderAt("/resume");
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Portfolio" })).not.toHaveAttribute("aria-current");
  });
});
