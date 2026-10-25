import { act, render } from "@testing-library/react";
import Matter from "matter-js";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SpriteDef } from "../../../pixel/types";
import { PhysicsOverlay, type PhysicsOverlayHandle } from "./PhysicsOverlay";
import type { TokenVisual } from "./tokenVisual";

interface FakeContext {
  canvas: HTMLCanvasElement;
  imageSmoothingEnabled: boolean;
  smoothingAtDraw: boolean[];
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

const pixels = (width: number, height: number) => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
});

function fakeContext(canvas: HTMLCanvasElement): FakeContext {
  const ctx: FakeContext = {
    canvas,
    imageSmoothingEnabled: true,
    smoothingAtDraw: [],
    draws: [],
    fills: [],
    sources: [],
    drawImage: (image: HTMLCanvasElement, ...args: number[]) => {
      ctx.draws.push({ image: [image.width, image.height], args });
      ctx.smoothingAtDraw.push(ctx.imageSmoothingEnabled);
    },
    fillRect: (...args: number[]) => ctx.fills.push(args),
    getImageData: (x: number, y: number, w: number, h: number) => {
      ctx.sources.push([x, y, w, h]);
      return pixels(w, h);
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

const overlayCanvas = (container: HTMLElement) =>
  container.querySelector<HTMLCanvasElement>('[data-testid="physics-overlay"]');

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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PhysicsOverlay", () => {
  it("is one transparent, full-viewport canvas that never takes pointer events", () => {
    const { container } = render(<PhysicsOverlay />);
    const canvas = overlayCanvas(container)!;
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none", "fixed", "inset-0", "h-full", "w-full");
    expect(canvas.width).toBe(window.innerWidth);
    expect(canvas.height).toBe(window.innerHeight);
  });

  it("spawnAt adds a body and draws it pixel-crisp", () => {
    const ref = createRef<PhysicsOverlayHandle>();
    const { container } = render(<PhysicsOverlay ref={ref} />);
    expect(engines).toHaveLength(1);

    act(() => ref.current!.spawnAt(200, 100));
    advanceFrames(3);

    expect(tokenBodies()).toHaveLength(1);
    expect(overlayCanvas(container)).toHaveAttribute("data-tokens", "1");
    const main = mainContext(container);
    expect(main.draws.length).toBeGreaterThan(0);
    expect(new Set(main.smoothingAtDraw)).toEqual(new Set([false]));
    // Default circles: 9 art pixels at 4x = 36px, padded to 52px so any rotation fits. Each draw
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
    const { container } = render(<PhysicsOverlay ref={ref} />);
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
    const { container } = render(<PhysicsOverlay ref={ref} />);
    act(() => ref.current!.spawnAt(200, 100));
    advanceFrames(3);
    expect(container.querySelector("canvas")).toBeNull();
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
