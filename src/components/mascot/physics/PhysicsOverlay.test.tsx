import { act, render } from "@testing-library/react";
import Matter from "matter-js";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SpriteDef } from "../../../pixel/types";
import { PhysicsOverlay, type PhysicsOverlayHandle } from "./PhysicsOverlay";
import type { TokenVisual } from "./tokenVisual";
import { FLING_MAX_SPEED, FLING_MIN_SPEED, REST_BEFORE_FADE_MS } from "./world";

interface FakeContext {
  canvas: HTMLCanvasElement;
  imageSmoothingEnabled: boolean;
  smoothingAtDraw: boolean[];
  globalAlpha: number;
  alphaAtDraw: number[];
  /** drawImage calls: the image's size, then every numeric argument. */
  draws: { image: [number, number]; args: number[] }[];
  fills: number[][];
  sources: number[][];
  [method: string]: unknown;
}

let contexts: FakeContext[];
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let now: number;
let engines: Matter.Engine[];
let listeners: { add: MockInstance; remove: MockInstance }[];
let resizeCallbacks: ResizeObserverCallback[];
let resizeDisconnects: number;
let observed: Element[];

/** When set, read-back frames report painted pixels, in the top `paintedRows` rows if given. */
let opaqueImages = false;
let paintedRows: number | undefined;

const pixels = (width: number, height: number) => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
});

const readBack = (width: number, height: number) => {
  const image = pixels(width, height);
  if (opaqueImages) image.data.fill(255, 0, (paintedRows ?? height) * width * 4);
  return image;
};

function fakeContext(canvas: HTMLCanvasElement): FakeContext {
  const ctx: FakeContext = {
    canvas,
    imageSmoothingEnabled: true,
    smoothingAtDraw: [],
    globalAlpha: 1,
    alphaAtDraw: [],
    draws: [],
    fills: [],
    sources: [],
    drawImage: (image: HTMLCanvasElement, ...args: number[]) => {
      ctx.draws.push({ image: [image.width, image.height], args });
      ctx.smoothingAtDraw.push(ctx.imageSmoothingEnabled);
      ctx.alphaAtDraw.push(ctx.globalAlpha);
    },
    fillRect: (...args: number[]) => ctx.fills.push(args),
    getImageData: (x: number, y: number, w: number, h: number) => {
      ctx.sources.push([x, y, w, h]);
      return readBack(w, h);
    },
    createImageData: pixels,
    putImageData: () => {},
    clearRect: () => {},
  };
  return ctx;
}

/** The overlay's own drawing context, as opposed to the offscreen token images. */
const mainContext = (container: HTMLElement) =>
  contexts.find((c) => c.canvas === overlayCanvas(container))!;
const tokenSources = () => contexts.flatMap((c) => c.sources);

/** Runs queued animation frames, 1/60s apart. */
function advanceFrames(count: number) {
  for (let i = 0; i < count; i++) {
    const queued = [...frames.entries()];
    frames.clear();
    now += 1000 / 60;
    for (const [, cb] of queued) cb(now);
  }
}

const overlayCanvas = (_container: HTMLElement) =>
  document.body.querySelector<HTMLCanvasElement>('[data-testid="physics-overlay"]');

const tokenBodies = () =>
  Matter.Composite.allBodies(engines.at(-1)!.world).filter((b) => !b.isStatic);

beforeEach(() => {
  contexts = [];
  frames = new Map();
  nextFrame = 1;
  now = 0;
  engines = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const ctx = fakeContext(this);
    contexts.push(ctx);
    return ctx as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const create = Matter.Engine.create;
  vi.spyOn(Matter.Engine, "create").mockImplementation((options) => {
    const engine = create(options);
    engines.push(engine);
    return engine;
  });
  listeners = [window, document].map((target) => ({
    add: vi.spyOn(target, "addEventListener"),
    remove: vi.spyOn(target, "removeEventListener"),
  }));
  resizeCallbacks = [];
  resizeDisconnects = 0;
  observed = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe(target: Element) {
        observed.push(target);
      }
      disconnect() {
        resizeDisconnects++;
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The original circle tokens: these tests check drawing mechanics, not the default look. */
const CIRCLES: TokenVisual = {
  kind: "circles",
  colors: ["var(--color-poly)", "var(--color-gold)"],
  pixels: 9,
  scale: 4,
};

describe("PhysicsOverlay", () => {
  it("is one transparent, full-viewport canvas that never takes pointer events", () => {
    const { container } = render(<PhysicsOverlay />);
    const canvas = overlayCanvas(container)!;
    expect(document.body.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none", "fixed", "inset-0", "h-full", "w-full");
    expect(canvas.width).toBe(window.innerWidth);
    expect(canvas.height).toBe(window.innerHeight);
  });

  it("spawnAt adds a body and draws it pixel-crisp", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    const { container } = render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
    expect(engines).toHaveLength(1);

    act(() => ref.current!.spawnAt(200, 100));
    advanceFrames(3);

    expect(tokenBodies()).toHaveLength(1);
    expect(overlayCanvas(container)).toHaveAttribute("data-tokens", "1");
    const main = mainContext(container);
    expect(main.draws.length).toBeGreaterThan(0);
    expect(new Set(main.smoothingAtDraw)).toEqual(new Set([false]));
    // Circles: 9 art pixels at 4x = 36px, padded to 52px so any rotation fits. Each draw
    // is a plain copy (no scaling) at whole-pixel coordinates.
    expect(tokenSources()).toEqual([
      [0, 0, 36, 36],
      [0, 0, 36, 36],
    ]);
    for (const { image, args } of main.draws) {
      expect(image).toEqual([52, 52]);
      expect(args).toHaveLength(2);
      expect(args.every(Number.isInteger)).toBe(true);
    }
  });

  it("covers each art pixel with a whole number of device pixels at fractional ratios", () => {
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2.625);
    const ref = createRef<PhysicsOverlayHandle>();
    const { container } = render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
    expect(overlayCanvas(container)!.width).toBe(Math.round(window.innerWidth * 2.625));
    act(() => ref.current!.spawnAt(200, 100));

    // 4 CSS px * 2.625 = 10.5 device px per art pixel, rounded to 11: 9 art pixels = 99.
    expect(tokenSources()[0]).toEqual([0, 0, 99, 99]);
    const fills = contexts
      .filter((c) => c.canvas !== overlayCanvas(container))
      .flatMap((c) => c.fills);
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.flat().every((n) => n % 11 === 0)).toBe(true);
    const { args } = mainContext(container).draws.at(-1)!;
    expect(args).toHaveLength(2);
    expect(args.every(Number.isInteger)).toBe(true);
  });

  it("draws a sprite instead when TokenVisual is a sprite", () => {
    const sprite: SpriteDef = {
      name: "test-token",
      palette: { g: "var(--color-gold)" },
      frames: [["gggggg", "gggggg", "gggggg", "gggggg", "gggggg"]],
    };
    const visual: TokenVisual = { kind: "sprite", sprite, scale: 5 };
    const ref = createRef<PhysicsOverlayHandle>();
    const { container } = render(<PhysicsOverlay ref={ref} visual={visual} />);
    act(() => ref.current!.spawnAt(200, 100));

    expect(tokenSources()).toEqual([[0, 0, 30, 25]]);
    expect(mainContext(container).draws.at(-1)!.image).toEqual([40, 40]);
    expect(tokenBodies()[0]!.circleRadius).toBe(15);
  });

  it("rebuilds the walls and keeps smoothing off when the viewport resizes or rotates", () => {
    render(<PhysicsOverlay />);
    const engine = engines[0]!;
    const floorTop = () =>
      Math.min(
        ...Matter.Composite.allBodies(engine.world)
          .filter((b) => b.isStatic && b.bounds.max.x - b.bounds.min.x > window.innerWidth)
          .map((b) => b.bounds.min.y),
      );
    expect(floorTop()).toBeCloseTo(window.innerHeight);

    for (const [event, w, h] of [
      ["resize", 375, 500],
      ["orientationchange", 500, 375],
    ] as const) {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(w);
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(h);
      for (const ctx of contexts) ctx.imageSmoothingEnabled = true;
      act(() => {
        window.dispatchEvent(new Event(event));
      });
      expect(floorTop()).toBeCloseTo(h);
      expect(Matter.Composite.allBodies(engine.world).filter((b) => b.isStatic)).toHaveLength(3);
      expect(contexts.some((c) => c.imageSmoothingEnabled === false)).toBe(true);
    }
  });

  it("re-measures its own box when a transformed wrapper changes it", () => {
    const { container } = render(
      <div style={{ transform: "translateY(8px)" }}>
        <PhysicsOverlay />
      </div>,
    );
    const canvas = overlayCanvas(container)!;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 640 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 480 });
    act(() =>
      resizeCallbacks.forEach((cb) =>
        cb(
          [
            {
              target: canvas,
              contentRect: { width: 640, height: 480 },
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        ),
      ),
    );
    expect(canvas.width).toBe(Math.round(640 * window.devicePixelRatio));
    expect(canvas.height).toBe(Math.round(480 * window.devicePixelRatio));
  });

  it("under reduced motion, renders nothing and drops no tokens", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(200, 100));
    advanceFrames(3);
    expect(document.body.querySelector("canvas")).toBeNull();
    expect(engines).toHaveLength(0);
    expect(frames.size).toBe(0);
    vi.unstubAllGlobals();
  });

  it("stops the engine, frames, and listeners on unmount", () => {
    const clear = vi.spyOn(Matter.Engine, "clear");
    const ref = createRef<PhysicsOverlayHandle>();
    const { unmount } = render(<PhysicsOverlay ref={ref} />);
    const handle = ref.current!;
    act(() => handle.spawnAt(200, 100));
    advanceFrames(2);
    expect(frames.size).toBe(1);

    unmount();

    expect(frames.size).toBe(0);
    expect(clear).toHaveBeenCalledWith(engines[0]);
    expect(Matter.Composite.allBodies(engines[0]!.world)).toHaveLength(0);
    for (const { add, remove } of listeners) {
      const added = add.mock.calls.map(([type, fn]) => [type, fn]);
      const removed = remove.mock.calls.map(([type, fn]) => [type, fn]);
      expect(added.length).toBeGreaterThan(0);
      expect(removed).toEqual(expect.arrayContaining(added));
    }
    expect(resizeDisconnects).toBe(1);
    // A stale handle is harmless and starts nothing.
    handle.spawnAt(10, 10);
    expect(frames.size).toBe(0);
    expect(Matter.Composite.allBodies(engines[0]!.world)).toHaveLength(0);
  });

  it("stops animating while the tab is hidden and resumes when shown", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(200, 100));
    expect(frames.size).toBe(1);

    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames.size).toBe(0);

    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames.size).toBe(1);
  });
});

describe("PhysicsOverlay and the page", () => {
  const FLOOR_FRAMES = 60 * 8;
  let reads: number;
  let photoTop: number;
  const colliderCount = () => Number(overlayCanvas(document.body)!.dataset.colliders);
  const collider = () =>
    Matter.Composite.allBodies(engines.at(-1)!.world).find((b) => b.label === "collider");

  beforeEach(() => {
    reads = 0;
    photoTop = 300;
    const main = document.createElement("main");
    const photo = document.createElement("img");
    photo.alt = "";
    photo.getBoundingClientRect = () => {
      reads++;
      return new DOMRect(100, photoTop, 200, 100);
    };
    main.append(photo);
    document.body.append(main);
  });

  afterEach(() => {
    document.querySelector("main")?.remove();
    vi.useRealTimers();
    Reflect.deleteProperty(document, "getAnimations");
  });

  const scroll = () =>
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

  it("reads no layout while there are no tokens to collide", () => {
    render(<PhysicsOverlay />);
    scroll();
    // A resize runs the loop, as the browser's first ResizeObserver callback does on every load.
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(frames.size).toBe(1);
    advanceFrames(3);
    expect(reads).toBe(0);
  });

  it("watches the page's own box, so a reflow can reach the colliders", () => {
    render(<PhysicsOverlay />);
    expect(observed).toContain(document.documentElement);
  });

  it("makes bodies from the page's elements before the first token moves", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(200, 100));
    advanceFrames(1);
    expect(colliderCount()).toBe(1);
    expect(collider()!.bounds.min).toEqual({ x: 100, y: 300 });
  });

  it("re-measures on scroll at most once a frame, and not on physics steps", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(2);
    const afterSpawn = reads;

    // A long fall: many frames, up to four physics steps each, with nothing to re-read.
    advanceFrames(30);
    expect(reads).toBe(afterSpawn);

    photoTop = 260;
    scroll();
    scroll();
    scroll();
    advanceFrames(1);
    expect(reads).toBe(afterSpawn + 1);
    expect(collider()!.bounds.min.y).toBe(260);
    advanceFrames(10);
    expect(reads).toBe(afterSpawn + 1);
  });

  it("re-measures when a scroll comes while every token rests and the loop has stopped", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(FLOOR_FRAMES);
    expect(overlayCanvas(document.body)).toHaveAttribute("data-resting", "true");
    expect(frames.size).toBe(0);

    photoTop = 200;
    scroll();
    expect(frames.size).toBe(1);
    advanceFrames(1);

    expect(collider()!.bounds.min.y).toBe(200);
    // Nothing near that token moved, so it never woke.
    expect(overlayCanvas(document.body)).toHaveAttribute("data-resting", "true");
    expect(frames.size).toBe(0);
  });

  it("re-measures when the page reflows, without resizing the canvas", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(1);
    const canvas = overlayCanvas(document.body)!;
    const { width, height } = canvas;

    photoTop = 240;
    act(() =>
      resizeCallbacks.forEach((cb) =>
        cb(
          [
            {
              target: document.documentElement,
              contentRect: { width: 11, height: 3000 },
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        ),
      ),
    );
    advanceFrames(1);

    expect(collider()!.bounds.min.y).toBe(240);
    expect([canvas.width, canvas.height]).toEqual([width, height]);
  });

  it("re-measures after the viewport resizes", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(1);
    photoTop = 180;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    advanceFrames(1);
    expect(collider()!.bounds.min.y).toBe(180);
  });

  it("re-measures once entrance animations finish", async () => {
    let finish = () => {};
    const entrance = new Promise<void>((resolve) => (finish = resolve));
    let running: unknown[] = [
      { effect: { getComputedTiming: () => ({ iterations: 1 }) }, finished: entrance },
    ];
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => running,
    });

    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    photoTop = 308; // Mid-rise, still 8px low.
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(1);
    expect(collider()!.bounds.min.y).toBe(308);

    photoTop = 300; // Risen, and nothing else announces it.
    advanceFrames(5);
    expect(collider()!.bounds.min.y).toBe(308);

    running = [];
    await act(async () => {
      finish();
      await entrance;
      await new Promise((resolve) => setTimeout(resolve));
    });
    advanceFrames(1);
    expect(collider()!.bounds.min.y).toBe(300);
  });

  it("re-measures once fonts load", async () => {
    let loaded = () => {};
    const ready = new Promise<void>((resolve) => (loaded = resolve));
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
    // Entrances still running, so that isn't what triggers the re-measure below.
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => [
        {
          effect: { getComputedTiming: () => ({ iterations: 1 }) },
          finished: new Promise(() => {}),
        },
      ],
    });

    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(1);

    photoTop = 290;
    await act(async () => {
      loaded();
      await ready;
    });
    advanceFrames(1);
    expect(collider()!.bounds.min.y).toBe(290);
    Reflect.deleteProperty(document, "fonts");
  });

  it("stops listening for scrolling on unmount", () => {
    const { unmount } = render(<PhysicsOverlay />);
    const added = listeners[0]!.add.mock.calls.filter(([type]) => type === "scroll");
    expect(added).toHaveLength(1);
    unmount();
    const removed = listeners[0]!.remove.mock.calls.filter(([type]) => type === "scroll");
    expect(removed[0]![1]).toBe(added[0]![1]);
    expect(removed[0]![2]).toMatchObject({ capture: true });
  });

  it("fades a resting token out after about ten seconds, then removes it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(FLOOR_FRAMES);
    const canvas = overlayCanvas(document.body)!;
    expect(canvas).toHaveAttribute("data-resting", "true");
    expect(frames.size).toBe(0);
    const main = mainContext(document.body);
    const drawsAtRest = main.draws.length;

    // Nothing runs while it rests: no frames at all, right up to the end of the wait.
    vi.advanceTimersByTime(REST_BEFORE_FADE_MS - 50);
    expect(frames.size).toBe(0);
    expect(main.draws.length).toBe(drawsAtRest);
    expect(canvas).toHaveAttribute("data-tokens", "1");

    // Then the fade runs frame by frame, in steps, without claiming that anything moved.
    vi.advanceTimersByTime(100);
    expect(frames.size).toBe(1);
    expect(canvas).toHaveAttribute("data-resting", "true");
    const alphas = new Set<number>();
    for (let i = 0; i < 60 && canvas.dataset.tokens === "1"; i++) {
      vi.advanceTimersByTime(1000 / 60);
      advanceFrames(1);
      alphas.add(main.alphaAtDraw.at(-1)!);
      expect(canvas).toHaveAttribute("data-resting", "true");
    }

    expect(canvas).toHaveAttribute("data-tokens", "0");
    expect(tokenBodies()).toHaveLength(0);
    expect([...alphas].sort()).toEqual([0.25, 0.5, 0.75, 1]);
    expect(frames.size).toBe(0);
    // Later tokens draw at full strength.
    expect(main.globalAlpha).toBe(1);
  });

  it("doesn't age resting tokens while the tab is hidden", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(FLOOR_FRAMES);
    const canvas = overlayCanvas(document.body)!;

    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vi.advanceTimersByTime(REST_BEFORE_FADE_MS * 3);
    expect(frames.size).toBe(0);

    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    advanceFrames(2);
    expect(canvas).toHaveAttribute("data-tokens", "1");
    expect(mainContext(document.body).alphaAtDraw.at(-1)).toBe(1);
  });

  it("clears the fade timer on unmount", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const ref = createRef<PhysicsOverlayHandle>();
    const { unmount } = render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
    act(() => ref.current!.spawnAt(600, 100));
    advanceFrames(FLOOR_FRAMES);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limits how many tokens exist at once", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    render(<PhysicsOverlay ref={ref} maxBodies={3} />);
    act(() => {
      for (let i = 0; i < 5; i++) ref.current!.spawnAt(100 + i * 60, 100);
    });
    expect(tokenBodies()).toHaveLength(3);
    expect(overlayCanvas(document.body)).toHaveAttribute("data-tokens", "3");
  });

  describe("a token launcher (the mascot)", () => {
    // The launcher's box: 300px square, centered at (250, 300).
    const BOX = { left: 100, top: 150, width: 300, height: 300 };
    const renderWithLauncher = (maxBodies?: number) => {
      const ref = createRef<PhysicsOverlayHandle>();
      const result = render(
        <>
          <button type="button" data-token-launcher="" data-testid="launcher" />
          <PhysicsOverlay ref={ref} visual={CIRCLES} maxBodies={maxBodies} />
        </>,
      );
      const launcher = result.getByTestId("launcher");
      vi.spyOn(launcher, "getBoundingClientRect").mockReturnValue({
        ...BOX,
        x: BOX.left,
        y: BOX.top,
        right: BOX.left + BOX.width,
        bottom: BOX.top + BOX.height,
        toJSON: () => ({}),
      });
      return ref;
    };
    const speedOf = (body: Matter.Body) => Math.hypot(body.velocity.x, body.velocity.y);

    it.each([
      ["the center", 250, 300],
      ["near a corner", 110, 160],
      ["on its far edge", 400, 450],
    ])("a press at %s flings the token out of the launcher's center", (_, x, y) => {
      const ref = renderWithLauncher();
      act(() => ref.current!.spawnAt(x, y));
      const [token] = tokenBodies();
      expect(token!.position).toEqual({ x: 250, y: 300 });
      expect(speedOf(token!)).toBeGreaterThanOrEqual(FLING_MIN_SPEED - 1e-9);
      expect(speedOf(token!)).toBeLessThanOrEqual(FLING_MAX_SPEED + 1e-9);
      expect(overlayCanvas(document.body)).toHaveAttribute("data-tokens", "1");

      // Ten frames are nine physics steps (the first frame only starts the clock). Even a launch
      // straight up at the slowest speed, slowed by gravity, gets well clear of the center.
      advanceFrames(10);
      expect(
        Math.hypot(token!.position.x - 250, token!.position.y - 300),
        "it moved away from the center",
      ).toBeGreaterThan(FLING_MIN_SPEED * 5);
    });

    it("a press anywhere else drops the token where it was, as before", () => {
      const ref = renderWithLauncher();
      act(() => ref.current!.spawnAt(600, 100));
      const [token] = tokenBodies();
      expect(token!.position).toEqual({ x: 600, y: 100 });
      // A drop's toss: upward, and no more than 3px a step sideways.
      expect(token!.velocity.y).toBeLessThan(0);
      expect(Math.abs(token!.velocity.x)).toBeLessThanOrEqual(3);
    });

    it("flung tokens count toward the same cap", () => {
      const ref = renderWithLauncher(3);
      act(() => {
        for (let i = 0; i < 5; i++) ref.current!.spawnAt(250, 300);
      });
      expect(tokenBodies()).toHaveLength(3);
      expect(overlayCanvas(document.body)).toHaveAttribute("data-tokens", "3");
    });
  });

  describe("at the viewport's edges", () => {
    beforeEach(() => {
      opaqueImages = true;
    });
    afterEach(() => {
      opaqueImages = false;
    });

    // CIRCLES: a 52px frame whose painted pixels, in this fake, fill it edge to edge.
    const lastDraw = () => {
      const { image, args } = mainContext(document.body).draws.at(-1)!;
      return { side: image[0], x: args[0]!, y: args[1]! };
    };

    it("draws a token on the floor fully inside the viewport's bottom edge", () => {
      const ref = createRef<PhysicsOverlayHandle>();
      render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
      act(() => ref.current!.spawnAt(600, 100));
      advanceFrames(FLOOR_FRAMES);

      const { side, y } = lastDraw();
      expect(tokenBodies()[0]!.position.y + side / 2).toBeGreaterThan(window.innerHeight);
      expect(y + side).toBe(window.innerHeight);
    });

    it("keeps its painted pixels inside when the frame's edge is empty", () => {
      // Only the frame's top half is painted, so the frame itself may hang past the edge.
      paintedRows = 26;
      const ref = createRef<PhysicsOverlayHandle>();
      render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
      act(() => ref.current!.spawnAt(600, 100));
      advanceFrames(FLOOR_FRAMES);

      const { side, y } = lastDraw();
      expect(y).toBe(Math.round(tokenBodies()[0]!.position.y - side / 2));
      expect(y + 26).toBeLessThanOrEqual(window.innerHeight);
      paintedRows = undefined;
    });

    it("draws a token against a side wall fully inside the viewport", () => {
      const ref = createRef<PhysicsOverlayHandle>();
      render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
      // Spawning draws at once. The body is 18px from the wall and the frame reaches 26px.
      act(() => ref.current!.spawnAt(0, 100));
      expect(tokenBodies()[0]!.position.x).toBe(18);
      expect(Math.abs(lastDraw().x)).toBe(0);

      act(() => ref.current!.spawnAt(window.innerWidth, 100));
      expect(lastDraw().x + lastDraw().side).toBe(window.innerWidth);
    });

    it("leaves a token alone away from the edges, without reading its pixels", () => {
      const ref = createRef<PhysicsOverlayHandle>();
      render(<PhysicsOverlay ref={ref} visual={CIRCLES} />);
      const before = tokenSources().length;
      act(() => ref.current!.spawnAt(600, 100));
      const { side, x, y } = lastDraw();
      expect(x).toBe(Math.round(tokenBodies()[0]!.position.x - side / 2));
      expect(y).toBe(Math.round(tokenBodies()[0]!.position.y - side / 2));
      // Two reads rasterize the art; none measures the rotated frame.
      expect(
        tokenSources()
          .slice(before)
          .every(([, , w]) => w === 36),
      ).toBe(true);
    });
  });
});
