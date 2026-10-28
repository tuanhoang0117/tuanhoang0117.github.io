import { vi } from "vitest";

/**
 * Test doubles for what jsdom lacks: a 2D canvas, layout sizes, IntersectionObserver,
 * ResizeObserver, and an animation-frame queue the test steps by hand. Every double records what
 * was created and released, so tests can check nothing outlives an unmount.
 */
export interface MascotTestEnv {
  /** Calls to the fake context's drawImage, across every canvas. */
  drawImage: ReturnType<typeof vi.fn>;
  /** Animation frames requested and not yet run or cancelled. */
  pendingFrames(): number;
  /** Runs every pending frame once, advancing the clock by `ms`. */
  runFrame(ms?: number): void;
  intersections: FakeObserver[];
  resizes: FakeObserver[];
  /** Listeners added for the given event types and not removed. */
  liveListeners(): { type: string; target: EventTarget }[];
  setHidden(hidden: boolean): void;
  restore(): void;
}

export interface FakeObserver {
  observed: Element[];
  disconnected: boolean;
  trigger(isIntersecting?: boolean): void;
}

const TRACKED = new Set(["pointermove", "pointerleave", "visibilitychange"]);

export function installMascotTestEnv({ size = 400 } = {}): MascotTestEnv {
  const drawImage = vi.fn();
  const fakeContext = () => ({
    clearRect: vi.fn(),
    fillText: vi.fn(),
    drawImage,
    getImageData: vi.fn(),
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    font: "",
    fillStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  });
  const spies = [
    vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => fakeContext() as unknown as CanvasRenderingContext2D),
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(size),
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(size),
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: size,
      height: size,
      right: size,
      bottom: size,
      toJSON: () => ({}),
    }),
  ];

  let nextFrame = 1;
  let now = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));

  const makeObserver = (list: FakeObserver[], intersection: boolean) =>
    class {
      record: FakeObserver;
      constructor(callback: (entries: unknown[]) => void) {
        this.record = {
          observed: [],
          disconnected: false,
          trigger: (isIntersecting = true) =>
            callback(
              this.record.observed.map((target) =>
                intersection ? { target, isIntersecting } : { target },
              ),
            ),
        };
        list.push(this.record);
      }
      observe(el: Element) {
        this.record.observed.push(el);
        // Like a browser, report the initial state soon after observing: on-screen, in tests.
        if (intersection) {
          queueMicrotask(() => {
            if (!this.record.disconnected) this.record.trigger(true);
          });
        }
      }
      unobserve() {}
      disconnect() {
        this.record.disconnected = true;
      }
    };
  const intersections: FakeObserver[] = [];
  const resizes: FakeObserver[] = [];
  vi.stubGlobal("IntersectionObserver", makeObserver(intersections, true));
  vi.stubGlobal("ResizeObserver", makeObserver(resizes, false));

  const live: { type: string; target: EventTarget; listener: unknown }[] = [];
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const addSpy = vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(function (
    this: EventTarget,
    type,
    listener,
    options,
  ) {
    // React delegates its own pointer listeners to the root container (the <div> Testing
    // Library renders into). Those belong to React, not to the mascot, so they're not tracked.
    const reactRoot = this instanceof HTMLDivElement && this.parentElement === document.body;
    if (TRACKED.has(type) && !reactRoot) live.push({ type, target: this, listener });
    add.call(this, type, listener, options);
  });
  const removeSpy = vi
    .spyOn(EventTarget.prototype, "removeEventListener")
    .mockImplementation(function (this: EventTarget, type, listener, options) {
      const i = live.findIndex(
        (l) => l.type === type && l.target === this && l.listener === listener,
      );
      if (i >= 0) live.splice(i, 1);
      remove.call(this, type, listener, options);
    });

  let hidden = false;
  const hiddenSpy = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);

  return {
    drawImage,
    pendingFrames: () => frames.size,
    runFrame(ms = 1000 / 60) {
      now += ms;
      const due = [...frames.entries()];
      frames.clear();
      for (const [, cb] of due) cb(now);
    },
    intersections,
    resizes,
    liveListeners: () => live.map(({ type, target }) => ({ type, target })),
    setHidden(next) {
      hidden = next;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    restore() {
      for (const spy of spies) spy.mockRestore();
      addSpy.mockRestore();
      removeSpy.mockRestore();
      hiddenSpy.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

/** Stubs `matchMedia` so `prefers-reduced-motion` reports `reduce`. Undo with vi.unstubAllGlobals. */
export function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}
