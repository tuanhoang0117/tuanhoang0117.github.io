import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMascotRenderer, type MascotRenderer } from "./renderer";
import { FILL_RAMP, OUTLINE_RAMP } from "./sampling";
import { installMascotTestEnv, type MascotTestEnv } from "./testEnv";
import * as source from "./source";
import { createRaster } from "./voxel";

// The real frames, with the model's `turn` wrapped in a spy so tests can count the voxel renders.
// With `fullBleed` set, a flat gray image that fills the whole raster instead, so glyph runs reach
// the ends of the grid's rows.
const turn = vi.fn<NonNullable<source.MascotFrames["turn"]>>();
let fullBleed = false;
vi.mock("./source", async (importOriginal) => {
  const actual = await importOriginal<typeof source>();
  return {
    ...actual,
    resolveMascotFrames: async (visual: Parameters<typeof actual.resolveMascotFrames>[0]) => {
      if (fullBleed) {
        const flat = createRaster(64);
        for (let p = 0; p < flat.data.length; p += 4) flat.data.set([128, 128, 128, 255], p);
        return { idle: flat, active: flat };
      }
      const frames = await actual.resolveMascotFrames(visual);
      const real = frames.turn!;
      turn.mockImplementation((angle, into) => real(angle, into));
      return { ...frames, turn };
    },
  };
});

let env: MascotTestEnv;
let renderer: MascotRenderer | null = null;
let canvas: HTMLCanvasElement;

// Lets the source resolve and the first-visibility callback run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const start = async (reducedMotion = false) => {
  canvas = document.createElement("canvas");
  document.body.append(canvas);
  renderer = startMascotRenderer(canvas, {
    source: { kind: "procedural-placeholder" },
    reducedMotion,
    pointerTarget: canvas,
  });
  await settle();
};

/**
 * Runs 100 ms frames until `data-angle` reaches `degrees`. Bounded, so an angle that stops moving
 * fails here with a message instead of looping until the test worker runs out of memory.
 */
const skipTo = (degrees: number) => {
  for (let frame = 0; frame < 200; frame++) {
    if (Number(canvas.dataset.angle) >= degrees) return;
    env.runFrame(100);
  }
  throw new Error(`data-angle stuck at ${canvas.dataset.angle}°, never reached ${degrees}°`);
};

/** The angle, in degrees, the model was last turned to. */
const lastTurn = () => (turn.mock.lastCall![0] * 180) / Math.PI;

const GLYPH_COUNT = FILL_RAMP.length + OUTLINE_RAMP.length;
/** Glyphs drawn wider than the grid's spacing in the browser: the fill ramp's dense blocks. */
const WIDE = new Set([8, 9, 10, 11, GLYPH_COUNT - 1]);
/** Fake ink, as atlas-tile columns: narrow glyphs 3 px wide, wide ones 9 px, centered. */
const inkOf = (glyph: number, tile: number): [number, number] => {
  const mid = Math.floor(tile / 2);
  return WIDE.has(glyph) ? [mid - 4, mid + 4] : [mid - 1, mid + 1];
};

/**
 * Makes each fake 2D context remember its canvas, so a drawImage call shows where it drew. With
 * `readable`, getImageData reports `inkOf` for every glyph of the atlas (its width is one tile per
 * glyph); without it, the atlas reads back as nothing, as when a canvas can't be read.
 */
const fakeContexts = (readable: boolean) => {
  type Make = (this: HTMLCanvasElement, ...args: unknown[]) => Record<string, unknown>;
  const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext) as unknown as {
    getMockImplementation(): Make;
    mockImplementation(make: Make): void;
  };
  const make = getContext.getMockImplementation();
  getContext.mockImplementation(function (this: HTMLCanvasElement, ...args) {
    const ctx = make.apply(this, args);
    ctx.canvas = this;
    ctx.getImageData = (_x: number, _y: number, width: number, height: number) => {
      if (!readable) return undefined;
      const tile = width / GLYPH_COUNT;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const [left, right] = inkOf(Math.floor(x / tile), tile);
          const column = x % tile;
          if (column >= left && column <= right) data[(y * width + x) * 4 + 3] = 255;
        }
      }
      return { width, height, data };
    };
    return ctx;
  });
};

interface Placement {
  /** The glyph's tile on the canvas, in device pixels. */
  x: number;
  y: number;
  /** Which atlas tile it is, as "sx,sy". */
  tile: string;
}

/**
 * Every drawImage into the mascot's canvas from call `from` on, unpacked into the glyph tiles it
 * copied, in drawing order. A strip's copies are known from the calls that built it; a copy is in
 * a draw when its ink is, and a draw that cuts through a copy's ink fails the test.
 */
const unpackDraws = (from = 0) => {
  const { calls, contexts } = env.drawImage.mock;
  const copies = new Map<unknown, { x: number; y: number; sx: number; sy: number }[]>();
  const draws: { wide: boolean; placements: Placement[] }[] = [];
  calls.forEach((args, k) => {
    const target = (contexts[k] as { canvas: HTMLCanvasElement }).canvas;
    const [src, sx, sy, sw, sh, dx, dy, dw, dh] = args as [unknown, ...number[]];
    if (target !== canvas) {
      const list = copies.get(target) ?? [];
      list.push({ x: dx!, y: dy!, sx: sx!, sy: sy! });
      copies.set(target, list);
      return;
    }
    if (k < from) return;
    expect([dw, dh], "copied at the source's own size").toEqual([sw, sh]);
    for (const n of [sx, sy, dx, dy, sw]) expect(Number.isInteger(n)).toBe(true);
    const tile = sh!;
    const placements: Placement[] = [];
    let wide = false;
    for (const copy of copies.get(src) ?? []) {
      if (copy.y !== sy) continue;
      const glyph = copy.sx / tile;
      const [left, right] = inkOf(glyph, tile).map((c) => copy.x + c) as [number, number];
      if (right < sx! || left >= sx! + sw!) continue;
      expect(left >= sx! && right < sx! + sw!, `draw ${k} cuts a glyph's ink`).toBe(true);
      wide ||= WIDE.has(glyph);
      placements.push({ x: dx! + copy.x - sx!, y: dy!, tile: `${copy.sx},${copy.sy}` });
    }
    expect(placements.length, `draw ${k} copies at least one glyph`).toBeGreaterThan(0);
    draws.push({ wide, placements });
  });
  return draws;
};

/**
 * Starts a fresh renderer (in a fresh test env) and records, for each of 30 frames 100 ms apart,
 * what it drew. A pulse at frame 10 adds the ripple.
 */
const recordFrames = async ({ readable, dpr = 1 }: { readable: boolean; dpr?: number }) => {
  renderer?.destroy();
  canvas?.remove();
  env.restore();
  env = installMascotTestEnv({ size: 400 });
  vi.stubGlobal("devicePixelRatio", dpr);
  fakeContexts(readable);
  await start();
  const frames = [unpackDraws()];
  for (let frame = 1; frame < 30; frame++) {
    if (frame === 10) renderer!.pulse(0.3, 0.6);
    const from = env.drawImage.mock.calls.length;
    env.runFrame(100);
    frames.push(unpackDraws(from));
  }
  return frames;
};

const placementsOf = (draws: { placements: Placement[] }[]) =>
  draws.flatMap(({ placements }) => placements);

beforeEach(() => {
  env = installMascotTestEnv({ size: 400 });
  turn.mockClear();
});
afterEach(() => {
  renderer?.destroy();
  renderer = null;
  canvas.remove();
  env.restore();
  fullBleed = false;
});

describe("startMascotRenderer", () => {
  it("turns the model only when its whole-degree angle changes", async () => {
    await start();
    expect(canvas.dataset.state).toBe("running");
    // The first frame turned the model to the rest pose's whole degree.
    expect(turn).toHaveBeenCalledOnce();
    expect(canvas.dataset.angle).toBe("20");

    // Skip ahead to the far profile (180°), then one second at 60 fps, where the angle moves a
    // fraction of a degree a frame. Per frame: did `data-angle` change, and how many turns ran.
    skipTo(175);
    turn.mockClear();
    let angle = canvas.dataset.angle;
    let changed = 0;
    for (let frame = 0; frame < 60; frame++) {
      const calls = turn.mock.calls.length;
      env.runFrame(1000 / 60);
      const next = canvas.dataset.angle;
      const turned = turn.mock.calls.length - calls;
      expect(turned, `frame ${frame}, ${angle}° to ${next}°`).toBe(next === angle ? 0 : 1);
      // Every turn was to the whole degree `data-angle` reports on that frame.
      if (turned) expect(lastTurn(), `frame ${frame}`).toBeCloseTo(Number(next), 9);
      if (next !== angle) changed++;
      angle = next;
    }
    // The angle did move, and it held still on most frames, so most frames reused the last turn.
    expect(changed).toBeGreaterThan(3);
    expect(turn.mock.calls.length).toBe(changed);
    expect(changed).toBeLessThan(60 / 3);
  });

  it("reports 0° rather than 360° as the turn comes round, and turns the model to 0°", async () => {
    await start();
    skipTo(355);
    // Through the wrap at 60 fps. Near the profile the angle moves a fraction of a degree a
    // frame, so some frames land between 359.5° and 360°, which round up to 360.
    const seen = new Set<string>();
    for (let frame = 0; frame < 120; frame++) {
      env.runFrame(1000 / 60);
      const reported = canvas.dataset.angle!;
      seen.add(reported);
      expect(Number(reported), `frame ${frame}`).toBeLessThan(360);
      expect(lastTurn(), `frame ${frame}`).toBeCloseTo(Number(reported), 9);
    }
    expect(seen).toContain("359");
    expect(seen).toContain("0");
  });

  it("still turns on every frame where the angle moves a degree or more, edge-on", async () => {
    await start();
    // Skip ahead to just before edge-on (90°), where the turn hurries.
    skipTo(80);
    let angle = canvas.dataset.angle;
    for (let frame = 0; frame < 20; frame++) {
      const calls = turn.mock.calls.length;
      env.runFrame(1000 / 60);
      const next = canvas.dataset.angle;
      expect(next, "edge-on, the angle moves every frame").not.toBe(angle);
      expect(turn.mock.calls.length - calls).toBe(1);
      angle = next;
    }
  });

  it.each([1, 1.5])(
    "at a %s× pixel ratio, copies runs of glyphs in one call each, placing every glyph as one call per cell would",
    async (dpr) => {
      // One call per cell: the atlas can't be read back, so no glyph's ink is known.
      const reference = await recordFrames({ readable: false, dpr });
      const batched = await recordFrames({ readable: true, dpr });
      expect(batched).toHaveLength(reference.length);
      let referenceCalls = 0;
      let batchedCalls = 0;
      let wideDraws = 0;
      reference.forEach((draws, frame) => {
        for (const { placements } of draws) expect(placements).toHaveLength(1);
        // The same glyphs at the same places, in the same order.
        expect(placementsOf(batched[frame]!), `frame ${frame}`).toEqual(placementsOf(draws));
        for (const { wide, placements } of batched[frame]!) {
          // A glyph whose ink is wider than the spacing would overlap its neighbor: never batched.
          if (wide) expect(placements, `frame ${frame}`).toHaveLength(1);
          if (wide) wideDraws++;
        }
        referenceCalls += draws.length;
        batchedCalls += batched[frame]!.length;
      });
      expect(wideDraws).toBeGreaterThan(0);
      expect(batchedCalls).toBeLessThan(referenceCalls * 0.7);
    },
  );

  it("never runs a batch of glyphs past the end of a row", async () => {
    // A flat image filling the whole canvas, first frame (no wave yet): every row is one long
    // run of the same glyph, right up to its last cell.
    fullBleed = true;
    fakeContexts(true);
    await start();
    const draws = unpackDraws();
    const rows = new Map<number, number[]>();
    for (const { x, y } of placementsOf(draws)) rows.set(y, [...(rows.get(y) ?? []), x]);
    expect(rows.size).toBeGreaterThan(10);
    const width = rows.values().next().value!.length;
    for (const [y, xs] of rows) {
      expect(xs, `row at y ${y}`).toHaveLength(width);
      expect(new Set(xs).size, `row at y ${y}`).toBe(width);
    }
    // Long runs did happen: a row of the grid took a few calls, not one per cell.
    expect(draws.length).toBeLessThan(rows.size * width * 0.25);
  });

  it("with reduced motion, shows the still pose and never turns the model", async () => {
    await start(true);
    expect(canvas.dataset.state).toBe("static");
    expect(canvas.dataset.angle).toBe("20");
    env.runFrame(1000);
    expect(turn).not.toHaveBeenCalled();
  });
});
