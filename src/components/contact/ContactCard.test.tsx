import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { socials } from "../../content/site";
import { ContactCard } from "./ContactCard";
import { contactKind } from "./links";

function renderCard() {
  return render(
    <MemoryRouter>
      <ContactCard />
    </MemoryRouter>,
  );
}

describe("contactKind", () => {
  it("recognizes each service from its href", () => {
    expect(contactKind("mailto:a@b.co")).toBe("email");
    expect(contactKind("https://www.linkedin.com/in/x/")).toBe("linkedin");
    expect(contactKind("https://github.com/x")).toBe("github");
    expect(contactKind("https://example.com")).toBe("other");
    expect(contactKind("/resume")).toBe("other");
  });
});

describe("ContactCard", () => {
  it("renders every social from site.ts, Email first, then LinkedIn, then GitHub", () => {
    renderCard();
    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href")).sort()).toEqual(
      socials.map((s) => s.href).sort(),
    );
    expect(links.map((a) => contactKind(a.getAttribute("href")!))).toEqual([
      "email",
      "linkedin",
      "github",
    ]);
  });

  it("opens external links in a new tab and keeps icons out of the accessibility tree", () => {
    renderCard();
    for (const a of within(screen.getByRole("list")).getAllByRole("link")) {
      const external = a.getAttribute("href")!.startsWith("http");
      expect(a.getAttribute("target")).toBe(external ? "_blank" : null);
      expect(a.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("links to the resume under the card", () => {
    renderCard();
    expect(screen.getByRole("link", { name: /resume/i })).toHaveAttribute("href", "/resume");
  });
});
