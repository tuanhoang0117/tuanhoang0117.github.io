import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRuns } from "./runs";
import { Sprite } from "./Sprite";
import type { SpriteDef } from "./types";

const blinker: SpriteDef = {
  name: "test-blinker",
  palette: { k: "var(--color-ink)", g: "var(--color-poly)" },
  frames: [
    ["kkk.", ".g..", "kgkg"],
    ["....", "gggg", "...."],
  ],
  fps: 4,
};
const still: SpriteDef = {
  name: "test-still",
  palette: blinker.palette,
  frames: [blinker.frames[0]!],
};
const FRAME_MS = 1000 / blinker.fps!;

const svgOf = (container: HTMLElement) => container.querySelector("svg")!;
const frameOf = (container: HTMLElement) => svgOf(container).getAttribute("data-frame");
const rectsOf = (container: HTMLElement) =>
  Array.from(svgOf(container).querySelectorAll("rect")).map((r) => ({
    x: Number(r.getAttribute("x")),
    y: Number(r.getAttribute("y")),
    width: Number(r.getAttribute("width")),
    color: r.getAttribute("fill"),
  }));

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

/** Installs an IntersectionObserver the test drives by hand. */
function mockIntersectionObserver() {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  return (isIntersecting: boolean) =>
    act(() => {
      for (const cb of callbacks) {
        cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
      }
    });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("<Sprite> rendering", () => {
  it("renders one crisp svg sized width×scale by height×scale", () => {
    const { container } = render(<Sprite sprite={blinker} scale={5} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    const svg = svgOf(container);
    expect(svg).toHaveAttribute("viewBox", "0 0 4 3");
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "15");
  });

  it("draws exactly one rect per run, at the run's position, size, and color", () => {
    const { container } = render(<Sprite sprite={blinker} scale={1} />);
    const runs = toRuns(blinker.frames[0]!, blinker.palette);
    expect(runs).toHaveLength(6);
    expect(rectsOf(container)).toEqual(runs);
    for (const rect of svgOf(container).querySelectorAll("rect")) {
      expect(rect).toHaveAttribute("height", "1");
    }
  });

  it("is hidden from assistive tech without a label", () => {
    const { container } = render(<Sprite sprite={blinker} scale={1} />);
    const svg = svgOf(container);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
  });

  it("is an image named by its label when it has one", () => {
    const { getByRole } = render(<Sprite sprite={blinker} scale={1} label="Musty waving" />);
    const img = getByRole("img", { name: "Musty waving" });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img).not.toHaveAttribute("aria-hidden");
  });
});

describe("<Sprite> development errors", () => {
  beforeEach(() => {
    // React logs render errors before rethrowing them; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([[1.5], [0], [-2], [Number.NaN]])("rejects scale %s", (scale) => {
    expect(() => render(<Sprite sprite={blinker} scale={scale} />)).toThrowError(
      /scale must be a positive integer/,
    );
  });

  it("throws on an invalid sprite, listing every problem", () => {
    const bad: SpriteDef = {
      name: "Bad Sprite",
      palette: { ".": "red", k: "var(--color-ink)" },
      frames: [["kz", "k"]],
    };
    expect(() => render(<Sprite sprite={bad} scale={1} />)).toThrowError(
      /Invalid sprite "Bad Sprite" \(4 problems\):\n- .*kebab-case.*\n- .*reserved.*\n- .*"z" isn't in the palette.*\n- .*row 1 is 1 pixels wide/,
    );
  });

  it("doesn't throw in production, where it renders what it can", () => {
    vi.stubEnv("DEV", false);
    const bad: SpriteDef = { ...blinker, name: "Bad Sprite" };
    const { container } = render(<Sprite sprite={bad} scale={2.4} />);
    expect(svgOf(container)).toHaveAttribute("width", "8");
  });
});

describe("<Sprite> animation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("steps through frames at fps and loops back to frame 0", () => {
    const { container } = render(<Sprite sprite={blinker} scale={1} />);
    expect(frameOf(container)).toBe("0");
    expect(rectsOf(container)).toEqual(toRuns(blinker.frames[0]!, blinker.palette));

    advance(FRAME_MS - 1);
    expect(frameOf(container)).toBe("0");

    advance(1);
    expect(frameOf(container)).toBe("1");
    expect(rectsOf(container)).toEqual(toRuns(blinker.frames[1]!, blinker.palette));

    advance(FRAME_MS);
    expect(frameOf(container)).toBe("0");
  });

  it("never sets a timer for a single-frame sprite", () => {
    const { container } = render(<Sprite sprite={still} scale={1} />);
    expect(vi.getTimerCount()).toBe(0);
    advance(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(frameOf(container)).toBe("0");
  });

  it("stops its timer on unmount", () => {
    const { unmount } = render(<Sprite sprite={blinker} scale={1} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows frame 0 and never animates under reduced motion", () => {
    mockReducedMotion(true);
    const { container } = render(<Sprite sprite={blinker} scale={1} />);
    expect(vi.getTimerCount()).toBe(0);
    advance(FRAME_MS * 5);
    expect(frameOf(container)).toBe("0");
    expect(rectsOf(container)).toEqual(toRuns(blinker.frames[0]!, blinker.palette));
  });

  it("snaps back to frame 0 and stops when reduced motion turns on mid-animation", () => {
    const setReduced = mockReducedMotion(false);
    const { container } = render(<Sprite sprite={blinker} scale={1} />);
    advance(FRAME_MS);
    expect(frameOf(container)).toBe("1");

    setReduced(true);
    expect(frameOf(container)).toBe("0");
    expect(vi.getTimerCount()).toBe(0);
    advance(FRAME_MS * 5);
    expect(frameOf(container)).toBe("0");
  });

  it("only animates while in the viewport, and pauses on the current frame", () => {
    const setInView = mockIntersectionObserver();
    const { container } = render(<Sprite sprite={blinker} scale={1} />);

    // Not reported visible yet: no timer.
    expect(vi.getTimerCount()).toBe(0);

    setInView(true);
    expect(vi.getTimerCount()).toBe(1);
    advance(FRAME_MS);
    expect(frameOf(container)).toBe("1");

    setInView(false);
    expect(vi.getTimerCount()).toBe(0);
    advance(FRAME_MS * 5);
    expect(frameOf(container)).toBe("1");

    setInView(true);
    advance(FRAME_MS);
    expect(frameOf(container)).toBe("0");
  });
});
