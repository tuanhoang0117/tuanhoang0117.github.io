import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { site } from "../../content/site";
import { Nav } from "./Nav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
      <Routes>
        <Route path="/" element={<p>home page</p>} />
        <Route path="*" element={<p>other page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const homeLink = () => screen.getByRole("link", { name: site.name });

describe("home link", () => {
  it("is a link to / named from content, outside the menu", () => {
    renderAt("/resume");
    expect(homeLink().getAttribute("href")).toBe("/");
    expect(homeLink().closest("nav")).toBeNull();
    expect(homeLink().closest("header")).not.toBeNull();
  });

  it("shows mustyIdle as decoration, so the name is heard once", () => {
    renderAt("/resume");
    const sprite = homeLink().querySelector("svg")!;
    expect(sprite.getAttribute("data-sprite")).toBe("musty-idle");
    expect(sprite.getAttribute("aria-hidden")).toBe("true");
    expect(sprite.getAttribute("shape-rendering")).toBe("crispEdges");
  });

  it("comes before the menu toggle in the tab order", () => {
    renderAt("/resume");
    const toggle = screen.getByRole("button", { name: /menu/ });
    expect(homeLink().compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("goes home when clicked", () => {
    renderAt("/resume");
    expect(screen.getByText("other page")).toBeTruthy();
    fireEvent.click(homeLink());
    expect(screen.getByText("home page")).toBeTruthy();
  });
});
