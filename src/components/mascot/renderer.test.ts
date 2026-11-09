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

interface Draw {
  wide: boolean;
  placements: Placement[];
}

/**
 * Returns a function that unpacks each drawImage into `target` made since its last call into the
 * glyph tiles it copied, in drawing order. A strip's copies are known from the calls that built
 * it; a copy is in a draw when its ink is, and a draw that cuts through a copy's ink fails the
 * test. Each call is read once, and the checks only build an assertion when one fails: a
 * recording is tens of thousands of draws.
 */
const drawReader = (env: MascotTestEnv, target: HTMLCanvasElement) => {
  // Per strip canvas, per row of it (y), the glyph copies drawn into that row.
  const copies = new Map<unknown, Map<number, { x: number; sx: number; sy: number }[]>>();
  let read = 0;
  return () => {
    const { calls, contexts } = env.drawImage.mock;
    const draws: Draw[] = [];
    for (; read < calls.length; read++) {
      const k = read;
      const into = (contexts[k] as { canvas: HTMLCanvasElement }).canvas;
      const [src, sx, sy, sw, sh, dx, dy, dw, dh] = calls[k] as [unknown, ...number[]];
      if (into !== target) {
        const rows = copies.get(into) ?? new Map<number, { x: number; sx: number; sy: number }[]>();
        copies.set(into, rows);
        const row = rows.get(dy!) ?? [];
        rows.set(dy!, row);
        row.push({ x: dx!, sx: sx!, sy: sy! });
        continue;
      }
      if (dw !== sw || dh !== sh) {
        expect([dw, dh], `draw ${k} copied at the source's own size`).toEqual([sw, sh]);
      }
      for (const n of [sx, sy, dx, dy, sw]) {
        if (!Number.isInteger(n)) expect.unreachable(`draw ${k} at ${n}, not a whole pixel`);
      }
      const tile = sh!;
      const placements: Placement[] = [];
      let wide = false;
      for (const copy of copies.get(src)?.get(sy!) ?? []) {
        const glyph = copy.sx / tile;
        const [inkLeft, inkRight] = inkOf(glyph, tile);
        const left = copy.x + inkLeft;
        const right = copy.x + inkRight;
        if (right < sx! || left >= sx! + sw!) continue;
        if (left < sx! || right >= sx! + sw!) expect.unreachable(`draw ${k} cuts a glyph's ink`);
        wide ||= WIDE.has(glyph);
        placements.push({ x: dx! + copy.x - sx!, y: dy!, tile: `${copy.sx},${copy.sy}` });
      }
      if (placements.length === 0) expect.unreachable(`draw ${k} copies no glyph`);
      draws.push({ wide, placements });
    }
    return draws;
  };
};

/** Frames per recording, 100 ms apart. A pulse at frame 10 adds the ripple. */
const RECORDED_FRAMES = 30;

/**
 * Starts a renderer in a test env of its own and records what it drew on each frame. Nothing here
 * is shared with other tests, and it stops at the next frame once `signal` aborts (the test timed
 * out), so a case still running after a timeout can't read or tear down another case's draws.
 */
const recordFrames = async ({
  readable,
  dpr,
  signal,
}: {
  readable: boolean;
  dpr: number;
  signal: AbortSignal;
}) => {
  const env = installMascotTestEnv({ size: 400 });
  const canvas = document.createElement("canvas");
  let renderer: MascotRenderer | null = null;
  try {
    vi.stubGlobal("devicePixelRatio", dpr);
    fakeContexts(readable);
    document.body.append(canvas);
    renderer = startMascotRenderer(canvas, {
      source: { kind: "procedural-placeholder" },
      reducedMotion: false,
      pointerTarget: canvas,
    });
    await settle();
    signal.throwIfAborted();
    const read = drawReader(env, canvas);
    const frames = [read()];
    for (let frame = 1; frame < RECORDED_FRAMES; frame++) {
      signal.throwIfAborted();
      if (frame === 10) renderer.pulse(0.3, 0.6);
      env.runFrame(100);
      frames.push(read());
    }
    return frames;
  } finally {
    renderer?.destroy();
    canvas.remove();
    env.restore();
  }
};

const placementsOf = (draws: { placements: Placement[] }[]) =>
  draws.flatMap(({ placements }) => placements);

const placementKey = ({ x, y, tile }: Placement) => `${x},${y}@${tile}`;

describe("startMascotRenderer", () => {
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

  it("never runs a batch of glyphs past the end of a row", async () => {
    // A flat image filling the whole canvas, first frame (no wave yet): every row is one long
    // run of the same glyph, right up to its last cell.
    fullBleed = true;
    fakeContexts(true);
    await start();
    const draws = drawReader(env, canvas)();
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

// No shared setup here: each recording builds and tears down its own test env.
describe("startMascotRenderer", () => {
  // A safety margin for slow runners, not the budget: a case takes about 150 ms locally.
  it.for([1, 1.5])(
    "at a %s× pixel ratio, copies runs of glyphs in one call each, placing every glyph as one call per cell would",
    { timeout: 30_000 },
    async (dpr, { signal }) => {
      // One call per cell: the atlas can't be read back, so no glyph's ink is known.
      const reference = await recordFrames({ readable: false, dpr, signal });
      const batched = await recordFrames({ readable: true, dpr, signal });
      expect(batched).toHaveLength(reference.length);
      let referenceCalls = 0;
      let batchedCalls = 0;
      let wideDraws = 0;
      // A frame is a few thousand draws, so each check is a plain comparison first, and the
      // assertion that explains a failure only runs when that comparison fails.
      reference.forEach((draws, frame) => {
        const runs = draws.filter(({ placements }) => placements.length !== 1);
        if (runs.length > 0) expect(runs, `frame ${frame}, one glyph per call`).toEqual([]);
        // The same glyphs at the same places, in the same order.
        const want = placementsOf(draws);
        const got = placementsOf(batched[frame]!);
        if (got.map(placementKey).join(" ") !== want.map(placementKey).join(" ")) {
          expect(got, `frame ${frame}`).toEqual(want);
        }
        const wide = batched[frame]!.filter((draw) => draw.wide);
        // A glyph whose ink is wider than the spacing would overlap its neighbor: never batched.
        const wideRuns = wide.filter(({ placements }) => placements.length !== 1);
        if (wideRuns.length > 0) expect(wideRuns, `frame ${frame}, wide glyphs`).toEqual([]);
        wideDraws += wide.length;
        referenceCalls += draws.length;
        batchedCalls += batched[frame]!.length;
      });
      expect(wideDraws).toBeGreaterThan(0);
      expect(batchedCalls).toBeLessThan(referenceCalls * 0.7);
    },
  );
});
