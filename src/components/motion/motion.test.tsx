import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARD_ENTER_MS,
  ENTER_EASING,
  PAGE_ENTER_MS,
  STAGGER_MAX_INDEX,
  STAGGER_STEP_MS,
  staggerDelay,
} from "./motion";
import { PageTransition } from "./PageTransition";
import { Stagger } from "./Stagger";

// jsdom has neither the Web Animations API nor matchMedia, so both are stubbed per test.
const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => ({
  cancel: vi.fn(),
}));

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)",
      media: query,
    })),
  );
}

beforeEach(() => {
  animate.mockClear();
  Element.prototype.animate = animate as unknown as Element["animate"];
  setReducedMotion(false);
});

afterEach(() => {
  delete (Element.prototype as Partial<Element>).animate;
  vi.unstubAllGlobals();
});

const cards = ["one", "two", "three", "four"];

function renderStagger(step?: number) {
  return render(
    <Stagger as="ul" step={step}>
      {cards.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </Stagger>,
  );
}

/** [element text, options] for each animate() call, in call order. */
function calls() {
  return animate.mock.calls.map(
    (args, i) => [(animate.mock.contexts[i] as Element).textContent, args[1]] as const,
  );
}

describe("staggerDelay", () => {
  it("spaces cards one step apart, starting at zero", () => {
    expect([0, 1, 2, 3].map((i) => staggerDelay(i))).toEqual([0, 60, 120, 180]);
    expect(staggerDelay(2, 40)).toBe(80);
  });

  it("caps the delay so long lists don't keep their tail waiting", () => {
    const cap = STAGGER_MAX_INDEX * STAGGER_STEP_MS;
    expect(staggerDelay(STAGGER_MAX_INDEX)).toBe(cap);
    expect(staggerDelay(STAGGER_MAX_INDEX + 20)).toBe(cap);
  });

  it("keeps the step within the 40–80 ms the issue asks for", () => {
    expect(STAGGER_STEP_MS).toBeGreaterThanOrEqual(40);
    expect(STAGGER_STEP_MS).toBeLessThanOrEqual(80);
  });
});

describe("Stagger", () => {
  it("plays each child's entrance one step after the previous, on mount", () => {
    renderStagger();
    expect(calls()).toEqual(
      cards.map((c, i) => [
        c,
        {
          duration: CARD_ENTER_MS,
          delay: i * STAGGER_STEP_MS,
          easing: ENTER_EASING,
          fill: "backwards",
        },
      ]),
    );
  });

  it("reveals each card top to bottom as it rises, never fading its text", () => {
    renderStagger();
    const [keyframes] = animate.mock.calls[0]!;
    expect(keyframes[0]!.clipPath).toMatch(/^inset\(-\d+px -\d+px 100% -\d+px\)$/);
    expect(keyframes[0]!.transform).toMatch(/^translateY\(\d+px\)$/);
    // Ends unclipped past the border box, so block shadows show, and in place.
    expect(keyframes.at(-1)!.clipPath).toMatch(/^inset\(-\d+px\)$/);
    expect(keyframes.at(-1)!.transform).toBe("none");
    for (const frame of keyframes) expect(frame).not.toHaveProperty("opacity");
  });

  it("uses a custom step", () => {
    renderStagger(40);
    expect(calls().map(([, o]) => o.delay)).toEqual([0, 40, 80, 120]);
  });

  it("renders the requested list element with its children", () => {
    renderStagger();
    expect(screen.getByRole("list")).toHaveAttribute("data-stagger");
    expect(screen.getAllByRole("listitem")).toHaveLength(cards.length);
  });

  it("never hides anything in markup: no inline opacity or transform", () => {
    const { container } = renderStagger();
    for (const el of container.querySelectorAll("*")) {
      expect(el.getAttribute("style")).toBeNull();
    }
  });

  it("cancels its animations on unmount", () => {
    const { unmount } = renderStagger();
    const running = animate.mock.results.map((r) => r.value);
    unmount();
    for (const a of running) expect(a.cancel).toHaveBeenCalled();
  });

  it("under reduced motion, plays nothing and renders the final state immediately", () => {
    setReducedMotion(true);
    const { container } = renderStagger();
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(cards.length);
    for (const el of container.querySelectorAll("*")) {
      expect(el.getAttribute("style")).toBeNull();
    }
  });

  it("still renders every child where the Web Animations API is missing", () => {
    delete (Element.prototype as Partial<Element>).animate;
    renderStagger();
    expect(screen.getAllByRole("listitem")).toHaveLength(cards.length);
  });
});

function renderRoutes() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <PageTransition>
            <Outlet />
          </PageTransition>
        ),
        children: [
          { path: "/", element: <p>home page</p> },
          { path: "/next", element: <p>next page</p> },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("PageTransition", () => {
  it("leaves the first page of a visit alone", () => {
    renderRoutes();
    expect(screen.getByText("home page")).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });

  it("fades and raises the page in on every route change", async () => {
    const router = renderRoutes();
    await act(() => router.navigate("/next"));

    expect(screen.getByText("next page")).toBeInTheDocument();
    expect(screen.queryByText("home page")).not.toBeInTheDocument();
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0]!;
    expect(keyframes[0]).toMatchObject({ opacity: 0 });
    expect(keyframes[0]!.transform).toMatch(/^translateY\(\d+px\)$/);
    expect(keyframes.at(-1)).toEqual({ opacity: 1, transform: "none" });
    expect(options).toEqual({
      duration: PAGE_ENTER_MS,
      delay: 0,
      easing: ENTER_EASING,
      fill: "backwards",
    });

    const first = animate.mock.results[0]!.value;
    await act(() => router.navigate("/"));
    expect(screen.getByText("home page")).toBeInTheDocument();
    expect(animate).toHaveBeenCalledTimes(2);
    // A new route change cancels the previous page's entrance instead of stacking on it.
    expect(first.cancel).toHaveBeenCalled();
  });

  it("runs within the 200–350 ms the issue asks for", () => {
    expect(PAGE_ENTER_MS).toBeGreaterThanOrEqual(200);
    expect(PAGE_ENTER_MS).toBeLessThanOrEqual(350);
  });

  it("under reduced motion, route changes play nothing", async () => {
    setReducedMotion(true);
    const router = renderRoutes();
    await act(() => router.navigate("/next"));
    expect(screen.getByText("next page")).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });
});
