import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { school } from "../../content/site";
import { BANNER_SPEED, Banner, loopDuration, repeatCount } from "./Banner";

describe("repeatCount", () => {
  it("covers the strip plus one copy, so sliding by one copy never shows a gap", () => {
    for (const copy of [37, 250, 300, 999, 2200]) {
      for (const strip of [0, 100, 375, 740, 1000, 1440]) {
        const n = repeatCount(copy, strip);
        // After sliding by one copy, the remaining n - 1 copies must still fill the strip.
        expect((n - 1) * copy, `copy ${copy}, strip ${strip}`).toBeGreaterThanOrEqual(strip);
        // And no more copies than that needs.
        expect((n - 2) * copy, `copy ${copy}, strip ${strip}`).toBeLessThan(Math.max(strip, 1));
      }
    }
  });

  it("is computed from the measured lengths", () => {
    expect(repeatCount(2000, 800)).toBe(2);
    expect(repeatCount(300, 1000)).toBe(5);
    expect(repeatCount(250, 1000)).toBe(5);
  });

  it("falls back to two copies before anything is measured", () => {
    expect(repeatCount(0, 800)).toBe(2);
  });
});

describe("loopDuration", () => {
  it("is the measured distance at a constant speed", () => {
    expect(loopDuration(2000, 80)).toBe(25_000);
    expect(loopDuration(800, 80)).toBe(10_000);
    for (const distance of [120, 1500, 3000]) {
      expect((distance / loopDuration(distance)) * 1000).toBeCloseTo(BANNER_SPEED);
    }
  });

  it("is zero when there is nothing to travel", () => {
    expect(loopDuration(0)).toBe(0);
  });

  it("uses a speed of 70–100 px/s", () => {
    expect(BANNER_SPEED).toBeGreaterThanOrEqual(70);
    expect(BANNER_SPEED).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------------------------

const COPY = { horizontal: 300, vertical: 360 };
const STRIP = { horizontal: 1000, vertical: 900 };

let media: { reduced: boolean; vertical: boolean };
let animate: ReturnType<typeof vi.fn>;
let observers: IntersectionObserverCallback[];

function stubBrowser() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduced-motion") ? media.reduced : media.vertical,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  // jsdom has no layout: report a fixed size for a copy and for the strip.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const axis = media.vertical ? "vertical" : "horizontal";
    const length =
      "bannerCopy" in this.dataset
        ? COPY[axis]
        : this.dataset.testid === "school-banner"
          ? STRIP[axis]
          : 0;
    return { width: length, height: length } as DOMRect;
  });
  animate = vi.fn(() => ({ cancel: vi.fn(), pause: vi.fn(), play: vi.fn() }));
  HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
}

const strip = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="school-banner"]')!;
const copiesOf = (c: HTMLElement) => c.querySelectorAll("[data-banner-copy]");
/** Text nodes with the school name that a screen reader would reach (not under aria-hidden). */
const heard = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("span")).filter(
    (el) => el.textContent === school.name && !el.closest('[aria-hidden="true"]'),
  );

beforeEach(() => {
  media = { reduced: false, vertical: true };
  observers = [];
  stubBrowser();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("Banner", () => {
  it("renders the school name from content", () => {
    const { container } = render(<Banner />);
    expect(copiesOf(container)[0]).toHaveTextContent(school.name);
  });

  it("repeats enough copies for the measured strip, vertically from md up", () => {
    const { container } = render(<Banner />);
    // 900px strip / 360px copy → 3 to cover it, plus one for the slide.
    expect(copiesOf(container)).toHaveLength(repeatCount(360, 900));
    expect(copiesOf(container)).toHaveLength(4);
    expect(strip(container)).toHaveAttribute("data-orientation", "vertical");
    expect(strip(container).style.writingMode).toBe("vertical-rl");
  });

  it("slides by one measured copy at the constant speed", () => {
    render(<Banner />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0]!;
    expect(keyframes).toEqual([
      { transform: "translate3d(0, 0, 0)" },
      { transform: "translate3d(0, -360px, 0)" },
    ]);
    expect(options).toMatchObject({ iterations: Infinity, easing: "linear" });
    expect(options.duration).toBe((360 / BANNER_SPEED) * 1000);
  });

  it("scrolls horizontally below md", () => {
    media.vertical = false;
    const { container } = render(<Banner />);
    expect(strip(container)).toHaveAttribute("data-orientation", "horizontal");
    expect(copiesOf(container)).toHaveLength(repeatCount(300, 1000));
    const [keyframes, options] = animate.mock.calls.at(-1)!;
    expect(keyframes[1]).toEqual({ transform: "translate3d(-300px, 0, 0)" });
    expect(options.duration).toBe((300 / BANNER_SPEED) * 1000);
  });

  it("screen readers hear the name once; duplicates are aria-hidden", () => {
    const { container } = render(<Banner />);
    expect(copiesOf(container).length).toBeGreaterThan(1);
    expect(heard(container)).toHaveLength(1);
    for (const copy of Array.from(copiesOf(container)).slice(1)) {
      expect(copy).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("with reduced motion, renders one static copy and never animates", () => {
    media.reduced = true;
    const { container } = render(<Banner />);
    expect(copiesOf(container)).toHaveLength(1);
    expect(strip(container)).toHaveAttribute("data-copies", "1");
    expect(heard(container)).toHaveLength(1);
    expect(animate).not.toHaveBeenCalled();
  });

  it("fades out and leaves the accessibility tree once the hero scrolls above the viewport", () => {
    const hero = createRef<HTMLDivElement>();
    const { container } = render(
      <>
        <div ref={hero} />
        <Banner hideAfter={hero} />
      </>,
    );
    expect(strip(container)).toHaveAttribute("data-state", "shown");
    const fire = (isIntersecting: boolean, bottom: number) =>
      act(() =>
        observers.forEach((cb) =>
          cb(
            [{ isIntersecting, boundingClientRect: { bottom } } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          ),
        ),
      );

    fire(false, -10);
    expect(strip(container)).toHaveAttribute("data-state", "hidden");
    expect(strip(container)).toHaveAttribute("aria-hidden", "true");
    expect(strip(container)).toHaveClass("opacity-0", "pointer-events-none");

    fire(true, 200);
    expect(strip(container)).toHaveAttribute("data-state", "shown");
    expect(strip(container)).not.toHaveAttribute("aria-hidden");
  });

  it("stays shown while the hero is still below the viewport", () => {
    const hero = createRef<HTMLDivElement>();
    const { container } = render(
      <>
        <div ref={hero} />
        <Banner hideAfter={hero} />
      </>,
    );
    act(() =>
      observers.forEach((cb) =>
        cb([{ isIntersecting: false, boundingClientRect: { bottom: 2000 } } as never], {} as never),
      ),
    );
    expect(strip(container)).toHaveAttribute("data-state", "shown");
  });

  it("reserves space on <body> while mounted, and gives it back on unmount", () => {
    const { unmount } = render(<Banner />);
    expect(document.body).toHaveClass("pb-14", "md:pr-24", "bg-graph");
    unmount();
    expect(document.body).not.toHaveClass("pb-14");
    expect(document.body).not.toHaveClass("md:pr-24");
  });
});
