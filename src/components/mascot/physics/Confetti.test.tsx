import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Confetti, CONFETTI_COLORS, CONFETTI_MS, confettiPieces } from "./Confetti";

const TOKEN_REF = /^var\(--color-[a-z0-9-]+\)$/;

/** Installs a matchMedia whose reduced-motion answer the test controls. */
function mockReducedMotion(initial: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => mql);
  return (matches: boolean) =>
    act(() => {
      mql.matches = matches;
      listeners.forEach((fn) => fn());
    });
}

/** A repeatable stand-in for Math.random. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const layer = () => document.querySelector<HTMLElement>('[data-testid="confetti"]');
const pieces = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-testid="confetti-piece"]'));

describe("Confetti", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls for about 2 s", () => {
    expect(CONFETTI_MS).toBe(2000);
  });

  it("shows pieces, then removes itself and calls onDone once when the burst ends", () => {
    const onDone = vi.fn();
    render(<Confetti onDone={onDone} random={seeded()} />);
    expect(layer()).toBeInTheDocument();
    expect(pieces().length).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(CONFETTI_MS - 1));
    expect(layer()).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(layer()).toBeNull();
    expect(pieces()).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(CONFETTI_MS * 2));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone after it unmounts early", () => {
    const onDone = vi.fn();
    const { unmount } = render(<Confetti onDone={onDone} />);
    unmount();
    act(() => vi.advanceTimersByTime(CONFETTI_MS * 2));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("never takes pointer events and clips its own pieces", () => {
    render(<Confetti />);
    const root = layer()!;
    expect(root).toHaveClass("pointer-events-none", "fixed", "inset-0", "overflow-hidden");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.parentElement).toBe(document.body);
    expect(document.querySelector('[class*="pointer-events-auto"]')).toBeNull();
  });

  it("colors every piece with a design token only", () => {
    render(<Confetti random={seeded(7)} />);
    const colored = Array.from(
      layer()!.querySelectorAll<HTMLElement>("[style*='background']"),
      (el) => el.style.backgroundColor,
    );
    expect(colored).toHaveLength(pieces().length);
    for (const color of colored) {
      expect(color).toMatch(TOKEN_REF);
      expect(CONFETTI_COLORS).toContain(color);
    }
    for (const color of CONFETTI_COLORS) expect(color).toMatch(TOKEN_REF);
  });

  it("lays out its pieces from the injected random source", () => {
    render(<Confetti pieces={6} random={seeded(11)} />);
    const expected = confettiPieces(6, CONFETTI_MS, seeded(11));
    expect(pieces().map((piece) => piece.style.left)).toEqual(
      expected.map((piece) => `${piece.left}%`),
    );
  });

  it("renders nothing under reduced motion and reports done at once", () => {
    mockReducedMotion(true);
    const onDone = vi.fn();
    const { container } = render(<Confetti onDone={onDone} />);
    expect(layer()).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("disappears if reduced motion turns on mid-burst", () => {
    const setReduced = mockReducedMotion(false);
    const onDone = vi.fn();
    render(<Confetti onDone={onDone} />);
    expect(layer()).toBeInTheDocument();
    setReduced(true);
    expect(layer()).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("starts every piece above the viewport and moves it only in stepped frames", () => {
    const calls: {
      el: Element;
      keyframes: Keyframe[];
      options: KeyframeAnimationOptions;
    }[] = [];
    const cancel = vi.fn();
    Element.prototype.animate = function (this: Element, keyframes, options) {
      calls.push({
        el: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
      });
      return { cancel } as unknown as Animation;
    };
    try {
      const { unmount } = render(<Confetti pieces={10} random={seeded(3)} />);
      for (const piece of pieces()) expect(piece).toHaveClass("absolute", "bottom-full");

      // Design rule 4: every animation steps through frames; none tweens.
      expect(calls).toHaveLength(20);
      for (const { options } of calls) expect(String(options.easing)).toMatch(/^steps\(/);

      const falls = calls.filter(({ el }) => el.matches('[data-testid="confetti-piece"]'));
      expect(falls).toHaveLength(10);
      for (const { keyframes, options } of falls) {
        expect(String(keyframes[1]!.transform)).toContain("100vh");
        expect(options.fill).toBe("both");
        expect(Number(options.delay) + Number(options.duration)).toBeLessThanOrEqual(CONFETTI_MS);
      }
      unmount();
      expect(cancel).toHaveBeenCalledTimes(20);
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
  });
});

describe("confettiPieces", () => {
  it("fits every piece's delay and fall inside the burst", () => {
    for (const roll of [0, 0.5, 0.9999]) {
      for (const piece of confettiPieces(20, CONFETTI_MS, () => roll)) {
        expect(piece.delay).toBeGreaterThanOrEqual(0);
        expect(piece.delay + piece.fall).toBeLessThanOrEqual(CONFETTI_MS);
        expect(piece.left).toBeGreaterThanOrEqual(0);
        expect(piece.left).toBeLessThan(100);
        expect(CONFETTI_COLORS).toContain(piece.color);
      }
    }
  });

  it("is repeatable for a fixed random source", () => {
    expect(confettiPieces(5, CONFETTI_MS, seeded(9))).toEqual(
      confettiPieces(5, CONFETTI_MS, seeded(9)),
    );
  });
});
