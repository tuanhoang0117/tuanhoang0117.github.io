import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navLinks } from "../../content/site";
import { MENU_FOCUS_DELAY_MS, MENU_HOVER_CLICK_GRACE_MS, MENU_LEAVE_GRACE_MS, Nav } from "./Nav";

/** Installs a matchMedia that answers whether the device can hover with a fine pointer. */
function stubMedia({ hover = false, reduced = false } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      (query.includes("hover: hover") && hover) || (query.includes("reduced-motion") && reduced),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
      <Routes>
        <Route path="*" element={<p data-testid="route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const toggle = () => screen.getByRole("button", { name: /menu/ });
const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!)!;
const firstLabel = navLinks[0]!.label;
/** Panel links are hidden (inert) while closed, so they're queried including hidden ones. */
const link = (name: string) => screen.getByRole("link", { name, hidden: true });

// A pointer click has detail 1; a keyboard-activated click (Enter or Space) has detail 0.
const pointerClick = (el: Element) => fireEvent.click(el, { detail: 1 });
const keyboardClick = (el: Element) => fireEvent.click(el, { detail: 0 });

beforeEach(() => stubMedia());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Nav", () => {
  it("is a Main navigation landmark holding the toggle", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toContainElement(toggle());
  });

  it("renders every nav link in the panel", () => {
    renderAt("/");
    for (const l of navLinks) {
      expect(link(l.label)).toHaveAttribute("href", l.href);
      expect(panel()).toContainElement(link(l.label));
    }
  });

  it("starts closed: collapsed toggle and an inert panel", () => {
    renderAt("/");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAccessibleName("Open menu");
    expect(toggle().tagName).toBe("BUTTON");
    expect(panel()).toHaveAttribute("inert");
    expect(panel()).toHaveAttribute("data-state", "closed");
  });

  it("toggles open and closed on click, updating aria-expanded and the label", () => {
    renderAt("/");
    pointerClick(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAccessibleName("Close menu");
    expect(panel()).not.toHaveAttribute("inert");
    expect(panel()).toHaveAttribute("data-state", "open");

    pointerClick(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAccessibleName("Open menu");
    expect(panel()).toHaveAttribute("inert");
  });

  it("closes on Escape and returns focus to the toggle", () => {
    vi.useFakeTimers();
    renderAt("/");
    keyboardClick(toggle());
    act(() => vi.advanceTimersByTime(MENU_FOCUS_DELAY_MS));
    expect(link(firstLabel)).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
  });

  it("moves focus to the first link only when opened from the keyboard", () => {
    vi.useFakeTimers();
    renderAt("/");
    pointerClick(toggle());
    act(() => vi.advanceTimersByTime(MENU_FOCUS_DELAY_MS));
    expect(link(firstLabel)).not.toHaveFocus();

    pointerClick(toggle());
    keyboardClick(toggle());
    act(() => vi.advanceTimersByTime(MENU_FOCUS_DELAY_MS));
    expect(link(firstLabel)).toHaveFocus();
  });

  it("closes when a link is chosen, after navigating to it", () => {
    renderAt("/");
    pointerClick(toggle());
    const target = navLinks.at(-1)!;
    fireEvent.click(link(target.label));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(link(target.label)).toHaveAttribute("aria-current", "page");
  });

  it("marks only the current page's link with aria-current", () => {
    renderAt("/resume");
    expect(link("Resume")).toHaveAttribute("aria-current", "page");
    for (const l of navLinks.filter((l) => l.label !== "Resume")) {
      expect(link(l.label)).not.toHaveAttribute("aria-current");
    }
  });

  it("keeps a section's link current on its child pages", () => {
    renderAt("/portfolio/remind-app");
    expect(link("Portfolio")).toHaveAttribute("aria-current", "page");
  });

  it("opens on hover only where the device can hover", () => {
    renderAt("/");
    fireEvent.mouseEnter(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on hover and closes after the pointer leaves the toggle and panel", () => {
    stubMedia({ hover: true });
    vi.useFakeTimers();
    renderAt("/");
    fireEvent.mouseEnter(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    // Toggle to panel: the grace period keeps it open.
    fireEvent.mouseLeave(toggle());
    act(() => vi.advanceTimersByTime(MENU_LEAVE_GRACE_MS - 50));
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseEnter(panel());
    act(() => vi.advanceTimersByTime(MENU_LEAVE_GRACE_MS * 2));
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseLeave(panel());
    act(() => vi.advanceTimersByTime(MENU_LEAVE_GRACE_MS));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a hover-opened menu open when the click that followed was meant to open it", () => {
    stubMedia({ hover: true });
    vi.useFakeTimers();
    renderAt("/");
    fireEvent.mouseEnter(toggle());
    pointerClick(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    act(() => vi.advanceTimersByTime(MENU_HOVER_CLICK_GRACE_MS));
    pointerClick(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });
});
