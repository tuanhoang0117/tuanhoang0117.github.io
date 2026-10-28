import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGGER_STEP_MS } from "../motion/motion";
import { contact, socials } from "../../content/site";
import { pageThemes } from "../../styles/themes";
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

  it("renders the prompt and resume lead-in from site.contact", () => {
    const original = { ...contact };
    contact.prompt = "Test prompt from site.ts";
    contact.resumeLead = "Test resume lead from site.ts";
    try {
      renderCard();
      expect(screen.getByText("Test prompt from site.ts")).toBeInTheDocument();
      expect(screen.getByText(/Test resume lead from site\.ts/)).toBeInTheDocument();
      expect(screen.queryByText(original.prompt)).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(original.resumeLead))).not.toBeInTheDocument();
    } finally {
      Object.assign(contact, original);
    }
  });

  it("puts the resume lead-in on the Contact theme's wash and shadow, not bare on the page", () => {
    renderCard();
    const aside = screen.getByRole("complementary");
    expect(aside).toHaveClass(pageThemes.contact.wash, pageThemes.contact.shadows[1]);
    expect(within(aside).getByRole("link", { name: /resume/i })).toBeInTheDocument();
    expect(within(aside).getByText(contact.resumeLead)).toBeInTheDocument();
  });

  it("links to the resume from the lead-in beside the card", () => {
    renderCard();
    expect(screen.getByRole("link", { name: /resume/i })).toHaveAttribute("href", "/resume");
  });

  describe("entrance", () => {
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("staggers the card, then the resume lead-in, one step apart", () => {
      // jsdom has no Web Animations API; record which elements animate, and when.
      const animate = vi.fn(() => ({ cancel: vi.fn() }));
      Element.prototype.animate = animate as unknown as Element["animate"];
      const { container } = renderCard();
      const blocks = [screen.getByTestId("contact-card"), screen.getByRole("complementary")];
      expect(container.firstElementChild).toHaveAttribute("data-stagger");
      expect([...container.firstElementChild!.children]).toEqual(blocks);
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      expect(animate.mock.contexts).toEqual(blocks);
      expect(calls.map(([, o]) => o.delay)).toEqual([0, STAGGER_STEP_MS]);
    });
  });
});
