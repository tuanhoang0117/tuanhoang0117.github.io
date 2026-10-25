import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { site } from "../../content/site";
import { HeroTitle } from "./HeroTitle";

/** Installs a matchMedia whose reduced-motion answer the test controls. */
function mockReducedMotion(initial: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", (q: string) => {
    expect(q).toBe("(prefers-reduced-motion: reduce)");
    return mql;
  });
  return (matches: boolean) =>
    act(() => {
      mql.matches = matches;
      listeners.forEach((fn) => fn());
    });
}

/** jsdom has no Web Animations, so record calls to Element.animate instead. */
function mockAnimate() {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
  return { animate, cancel };
}

const lastWord = site.name.slice(site.name.lastIndexOf(" ") + 1);
const overlayOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-shimmer]")!;

describe("HeroTitle", () => {
  let anim: ReturnType<typeof mockAnimate>;

  beforeEach(() => {
    anim = mockAnimate();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it("gives the heading one accessible name: the site name, heard once", () => {
    mockReducedMotion(false);
    const { container } = render(<HeroTitle />);
    const heading = screen.getByRole("heading", { level: 1 });
    // Exact match: a second, announced copy of the last word would read "Tuan HoangHoang".
    expect(heading).toHaveAccessibleName(site.name);
    expect(screen.getAllByRole("heading")).toHaveLength(1);

    const overlay = overlayOf(container);
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveTextContent(lastWord, { normalizeWhitespace: false });
    expect(heading.textContent).toBe(`${site.name}${lastWord}`);
  });

  it("is 60px on phones and 128px from md, and joins the lead word to the line only where it fits", () => {
    mockReducedMotion(false);
    render(<HeroTitle />);
    const heading = screen.getByRole("heading", { level: 1 });
    // jsdom can't lay out, so check the classes; e2e/hero-title.spec.ts measures the result.
    expect(heading).toHaveClass("text-6xl", "md:text-9xl");
    const lead = heading.firstElementChild!;
    expect(lead).toHaveTextContent(site.name.slice(0, site.name.lastIndexOf(" ")));
    // Stacked by default, one line at @sm on phones and at @4xl from md.
    expect(lead).toHaveClass("block", "@sm:max-md:inline", "md:@4xl:inline");
  });

  it("renders the requested heading level", () => {
    mockReducedMotion(false);
    render(<HeroTitle as="h2" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName(site.name);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("shimmers only the last word, with a token-only Cal Poly gradient clipped to the letters", () => {
    mockReducedMotion(false);
    const { container } = render(<HeroTitle />);
    const overlay = overlayOf(container);
    expect(overlay.textContent).toBe(lastWord);
    expect(overlay).toHaveClass("bg-clip-text", "text-transparent");

    const gradient = overlay.style.backgroundImage;
    expect(gradient).toMatch(/^linear-gradient\(/);
    // No raw colors: no hex and no rgb()/hsl() literals (the "srgb" in color-mix is a color space).
    expect(gradient).not.toMatch(/#|\brgba?\(|\bhsla?\(/);
    const colors = Array.from(gradient.matchAll(/var\(--color-([a-z-]+)\)/g), (m) => m[1]);
    expect(colors).toEqual(expect.arrayContaining(["surf", "morro", "stadium", "avocado"]));
  });

  it("drifts the shimmer for about 7 s each way, alternating, forever", () => {
    mockReducedMotion(false);
    const { container } = render(<HeroTitle />);
    expect(anim.animate).toHaveBeenCalledTimes(1);
    expect(anim.animate.mock.contexts[0]).toBe(overlayOf(container));
    expect(anim.animate).toHaveBeenCalledWith(
      [{ backgroundPosition: "10% 20%" }, { backgroundPosition: "70% 80%" }],
      expect.objectContaining({ duration: 7000, direction: "alternate", iterations: Infinity }),
    );
  });

  it("holds the shimmer still under reduced motion", () => {
    mockReducedMotion(true);
    const { container } = render(<HeroTitle />);
    expect(anim.animate).not.toHaveBeenCalled();
    // Still drawn, just static.
    expect(overlayOf(container).style.backgroundPosition).toBe("10% 20%");
  });

  it("stops the shimmer when reduced motion turns on while mounted", () => {
    const setReduced = mockReducedMotion(false);
    render(<HeroTitle />);
    expect(anim.animate).toHaveBeenCalledTimes(1);
    setReduced(true);
    expect(anim.cancel).toHaveBeenCalledTimes(1);
    expect(anim.animate).toHaveBeenCalledTimes(1);
  });
});
