import type { MascotVisualSource } from "../../content/types";
import {
  ALPHA_LEVELS,
  COLOR_RAMP,
  FILL_RAMP,
  OUTLINE_RAMP,
  PARALLAX,
  STILL,
  alphaLevel,
  cellLayout,
  inkTone,
  rampIndex,
  sampleAt,
  stepMotion,
  type Motion,
  type Raster,
} from "./sampling";
import { resolveMascotFrames, type MascotFrames } from "./source";
import { createRaster, easeTurn, REST_ANGLE, REST_PHASE, SPIN_BASE_SPEED } from "./voxel";

/** Share of the canvas's shorter side the mascot covers, leaving room for parallax to move. */
const COVER = 0.94;
const GLYPHS = [...FILL_RAMP, ...OUTLINE_RAMP];
const TILES = GLYPHS.length * COLOR_RAMP.length;
/** The longest run of identical neighboring glyphs copied with one `drawImage`. */
const RUN = 16;
/** Column spacings that take more columns than this to repeat are not batched. */
const MAX_PERIOD = 8;

/**
 * Lighter settings for devices that would struggle: fewer frames and a smaller backing store.
 * `deviceMemory` is Chromium-only; elsewhere only the core count decides.
 */
function deviceProfile() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const low = (nav.deviceMemory ?? 8) < 4 || (nav.hardwareConcurrency ?? 8) < 4;
  return low ? { fps: 30, maxDpr: 1.5 } : { fps: 60, maxDpr: 3 };
}

/** An angle in radians as whole degrees (0–359): what `data-angle` shows and the model turns to. */
const wholeDegrees = (radians: number) => Math.round((radians * 180) / Math.PI) % 360;

/** Lifecycle as seen from outside, written to `data-state` on the canvas for tests and debugging. */
export type RendererState = "loading" | "running" | "paused" | "static" | "unsupported";

export interface RendererOptions {
  source: MascotVisualSource;
  /** Draw one still frame and never animate. */
  reducedMotion: boolean;
  /** The element whose pointer movement drives the ripple and parallax. */
  pointerTarget: HTMLElement;
}

export interface MascotRenderer {
  /** Shows the active frame (if the source has one) while pressed. */
  setActive(active: boolean): void;
  /** Sends a ripple out from a point (normalized to the canvas), as on a press. */
  pulse(x: number, y: number): void;
  /** Stops the loop and removes every observer and listener. Safe to call twice. */
  destroy(): void;
}

/**
 * Draws the mascot as glyph cells on `canvas` until destroyed. The canvas's CSS size decides the
 * layout; its backing store tracks the device pixel ratio so glyphs stay crisp. Every glyph is
 * drawn once into an atlas and copied with `drawImage`, at whole device pixels and the atlas's own
 * size, so nothing is resampled and nothing blurs.
 *
 * Each `drawImage` has a fixed cost, so a run of identical glyphs side by side in a row is copied
 * in one call, from a strip that holds the glyph repeated at the grid's spacing. That is only done
 * for glyphs whose ink is no wider than the spacing: neighbors then never share a pixel, so one
 * call paints exactly the pixels, in the same order, that one call per cell would. Wider glyphs
 * (the dense blocks) overlap their neighbors and keep one call each.
 */
export function startMascotRenderer(
  canvas: HTMLCanvasElement,
  { source, reducedMotion, pointerTarget }: RendererOptions,
): MascotRenderer {
  const setState = (state: RendererState) => {
    if (canvas.dataset.state !== state) canvas.dataset.state = state;
  };
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    setState("unsupported");
    return { setActive() {}, pulse() {}, destroy() {} };
  }

  const profile = deviceProfile();
  let disposed = false;
  let frames: MascotFrames | null = null;
  let active = false;
  let visible = typeof IntersectionObserver === "undefined";
  let motion: Motion = STILL;
  let targetX = 0.5;
  let targetY = 0.5;
  let raf = 0;
  let lastTick = 0;
  let drawn = 0;
  // A spinning model is drawn into this renderer's own raster, turned to whole degrees, and only
  // when that whole-degree angle changes. The eased angle is a fresh float every frame, so
  // comparing it unrounded would redraw the model on every frame; near the profiles the angle
  // moves a fraction of a degree a frame, so most frames there reuse the last turn.
  let turned: Raster | null = null;
  let turnedDegrees = NaN;
  // The spin's phase. It advances at the base speed and is eased into the angle the model shows.
  let spinPhase = REST_PHASE;

  // Grid, rebuilt on resize. Positions are in device pixels; u/v index the source; sx/sy place
  // the cell on the canvas (0–1) for the wave and the pointer distance.
  let cells = 0;
  let perRow = 0;
  let cellU = new Float32Array(0);
  let cellV = new Float32Array(0);
  let cellSX = new Float32Array(0);
  let cellSY = new Float32Array(0);
  let cellX = new Int32Array(0);
  let cellY = new Int32Array(0);
  // Per frame: which atlas tile each cell uses (-1 = empty) and its opacity batch.
  let cellTile = new Int32Array(0);
  let cellLevel = new Uint8Array(0);
  let order = new Int32Array(0);
  let reach = 0;
  let fontPx = 0;

  let atlas: HTMLCanvasElement | null = null;
  let tile = 0;
  // Per glyph, the first and last atlas-tile column with any ink, in any color (right < 0: none
  // found, or the canvas can't be read back, so the glyph isn't batched).
  let inkLeft = new Int32Array(GLYPHS.length);
  let inkRight = new Int32Array(GLYPHS.length).fill(-1);

  // Runs of cells are copied from `strips`: one row per atlas tile and, side by side, one region
  // per column phase. Column gaps in device pixels repeat every `period` columns (1 at whole-pixel
  // spacings, 2 at 7.5 px, and so on); `runOffsets[phase][j]` is the x of the jth cell of a run
  // that starts at a column of that phase, relative to the first. Every draw comes from `strips`.
  let strips: HTMLCanvasElement | null = null;
  let stripWidth = 0;
  let runOffsets: Int32Array[] = [];
  let batchable = new Uint8Array(GLYPHS.length);

  const fontFamily = () =>
    getComputedStyle(canvas).getPropertyValue("--font-mono").trim() || "monospace";

  const buildAtlas = () => {
    if (fontPx === 0) return;
    const styles = getComputedStyle(canvas);
    tile = Math.ceil(fontPx * 1.35);
    const sheet = document.createElement("canvas");
    sheet.width = tile * GLYPHS.length;
    sheet.height = tile * COLOR_RAMP.length;
    const g = sheet.getContext("2d");
    if (!g) {
      atlas = null;
      return;
    }
    g.font = `700 ${fontPx}px ${fontFamily()}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    COLOR_RAMP.forEach((token, row) => {
      g.fillStyle = styles.getPropertyValue(token).trim();
      GLYPHS.forEach((glyph, col) => {
        g.fillText(glyph, col * tile + tile / 2, row * tile + tile / 2);
      });
    });
    atlas = sheet;
    measureInk(g, sheet.width, sheet.height);
    buildStrips();
  };

  // Read once per atlas. The atlas is only a source for the strips, so the read-back never slows
  // a frame.
  const measureInk = (g: CanvasRenderingContext2D, width: number, height: number) => {
    inkLeft = new Int32Array(GLYPHS.length).fill(tile);
    inkRight = new Int32Array(GLYPHS.length).fill(-1);
    let data: Uint8ClampedArray | undefined;
    try {
      data = g.getImageData(0, 0, width, height)?.data;
    } catch {
      data = undefined;
    }
    if (!data || data.length < width * height * 4) return;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        const glyph = Math.floor(x / tile);
        const column = x - glyph * tile;
        if (column < inkLeft[glyph]!) inkLeft[glyph] = column;
        if (column > inkRight[glyph]!) inkRight[glyph] = column;
      }
    }
  };

  // Rebuilt with the atlas and on every layout, since the column gaps depend on both.
  const buildStrips = () => {
    strips = null;
    if (!atlas || perRow === 0) return;
    const gaps = new Int32Array(Math.max(0, perRow - 1));
    for (let c = 0; c < gaps.length; c++) gaps[c] = cellX[c + 1]! - cellX[c]!;
    let period = 0;
    for (let p = 1; p <= MAX_PERIOD && period === 0 && gaps.length > 0; p++) {
      let repeats = true;
      for (let c = p; c < gaps.length && repeats; c++) repeats = gaps[c] === gaps[c % p];
      if (repeats) period = p;
    }
    let minGap = Infinity;
    for (let c = 0; c < Math.min(period, gaps.length); c++) minGap = Math.min(minGap, gaps[c]!);

    runOffsets = [];
    for (let phase = 0; phase < period; phase++) {
      const offsets = new Int32Array(RUN);
      for (let j = 1; j < RUN; j++) offsets[j] = offsets[j - 1]! + gaps[(phase + j - 1) % period]!;
      runOffsets.push(offsets);
    }
    batchable = new Uint8Array(GLYPHS.length);
    for (let glyph = 0; glyph < GLYPHS.length; glyph++) {
      const right = inkRight[glyph]!;
      batchable[glyph] = period > 0 && right >= 0 && right - inkLeft[glyph]! + 1 <= minGap ? 1 : 0;
    }
    if (!batchable.includes(1)) runOffsets = [];

    stripWidth = tile;
    for (const offsets of runOffsets) stripWidth = Math.max(stripWidth, offsets[RUN - 1]! + tile);
    const sheet = document.createElement("canvas");
    sheet.width = stripWidth * Math.max(1, runOffsets.length);
    sheet.height = tile * TILES;
    const g = sheet.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    for (let t = 0; t < TILES; t++) {
      const sx = (t % GLYPHS.length) * tile;
      const sy = Math.floor(t / GLYPHS.length) * tile;
      if (!batchable[t % GLYPHS.length]) {
        // Only the first copy, so a single cell's whole tile holds no neighbor's ink.
        g.drawImage(atlas, sx, sy, tile, tile, 0, t * tile, tile, tile);
        continue;
      }
      runOffsets.forEach((offsets, phase) => {
        for (const offset of offsets) {
          g.drawImage(
            atlas!,
            sx,
            sy,
            tile,
            tile,
            phase * stripWidth + offset,
            t * tile,
            tile,
            tile,
          );
        }
      });
    }
    strips = sheet;
  };

  const layout = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, profile.maxDpr);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.dataset.dpr = String(dpr);
    ctx.imageSmoothingEnabled = false;

    const { step, font } = cellLayout(width);
    const side = Math.min(width, height) * COVER;
    const left = (width - side) / 2;
    const top = (height - side) / 2;
    const per = Math.floor(side / step);
    perRow = per;
    cells = per * per;
    cellU = new Float32Array(cells);
    cellV = new Float32Array(cells);
    cellSX = new Float32Array(cells);
    cellSY = new Float32Array(cells);
    cellX = new Int32Array(cells);
    cellY = new Int32Array(cells);
    cellTile = new Int32Array(cells);
    cellLevel = new Uint8Array(cells);
    order = new Int32Array(cells);
    for (let row = 0; row < per; row++) {
      for (let col = 0; col < per; col++) {
        const i = row * per + col;
        const x = left + (col + 0.5) * step;
        const y = top + (row + 0.5) * step;
        cellU[i] = (x - left) / side;
        cellV[i] = (y - top) / side;
        cellSX[i] = x / width;
        cellSY[i] = y / height;
        cellX[i] = Math.round(x * dpr);
        cellY[i] = Math.round(y * dpr);
      }
    }
    reach = step / side;
    const nextFont = Math.max(1, Math.round(font * dpr));
    if (nextFont !== fontPx || !atlas) {
      fontPx = nextFont;
      buildAtlas();
    } else {
      buildStrips();
    }
    return true;
  };

  // The raster to sample this frame. A model spins with the animation clock; with reduced motion
  // it holds its still pose (`idle`), which is already drawn.
  const currentRaster = (resolved: MascotFrames): Raster => {
    if (!resolved.turn || reducedMotion) {
      if (resolved.turn) canvas.dataset.angle = String(wholeDegrees(REST_ANGLE));
      return active ? resolved.active : resolved.idle;
    }
    const angle = wholeDegrees(easeTurn(spinPhase));
    turned ??= createRaster(resolved.idle.width);
    if (angle !== turnedDegrees) {
      resolved.turn((angle * Math.PI) / 180, turned);
      turnedDegrees = angle;
      canvas.dataset.angle = String(angle);
    }
    return turned;
  };

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!frames || !strips || cells === 0) return;
    const raster = currentRaster(frames);
    const shiftX = (motion.pointerX - 0.5) * 2 * PARALLAX;
    const shiftY = (motion.pointerY - 0.5) * 2 * PARALLAX;
    const counts = new Int32Array(ALPHA_LEVELS);

    for (let i = 0; i < cells; i++) {
      const sample = sampleAt(raster, cellU[i]! + shiftX, cellV[i]! + shiftY, reach);
      if (!sample) {
        cellTile[i] = -1;
        continue;
      }
      const ink = inkTone(sample.luminance, cellSX[i]!, cellSY[i]!, motion);
      const glyph = sample.edge
        ? FILL_RAMP.length + rampIndex(ink, OUTLINE_RAMP.length)
        : rampIndex(ink, FILL_RAMP.length);
      const color = rampIndex(ink, COLOR_RAMP.length);
      cellTile[i] = color * GLYPHS.length + glyph;
      const level = alphaLevel(sample.alpha);
      cellLevel[i] = level;
      counts[level]!++;
    }

    // Counting sort by opacity, so globalAlpha changes once per batch rather than per glyph.
    const starts = new Int32Array(ALPHA_LEVELS);
    for (let l = 1; l < ALPHA_LEVELS; l++) starts[l] = starts[l - 1]! + counts[l - 1]!;
    const ends = starts.slice();
    for (let i = 0; i < cells; i++) {
      if (cellTile[i]! >= 0) order[ends[cellLevel[i]!]!++] = i;
    }

    const half = Math.floor(tile / 2);
    for (let l = 0; l < ALPHA_LEVELS; l++) {
      if (counts[l] === 0) continue;
      ctx.globalAlpha = (l + 1) / ALPHA_LEVELS;
      for (let k = starts[l]!; k < ends[l]!;) {
        const i = order[k]!;
        const t = cellTile[i]!;
        const glyph = t % GLYPHS.length;
        let run = 1;
        let sx = 0;
        let width = tile;
        if (batchable[glyph]) {
          // Same row, same opacity batch (the next entry in `order` is the next cell), same tile.
          const col = i % perRow;
          while (
            run < RUN &&
            col + run < perRow &&
            k + run < ends[l]! &&
            order[k + run] === i + run &&
            cellTile[i + run] === t
          ) {
            run++;
          }
          const phase = col % runOffsets.length;
          sx = phase * stripWidth;
          // Up to the last copy's ink, which stops short of the next copy's.
          width = runOffsets[phase]![run - 1]! + inkRight[glyph]! + 1;
        }
        const x = cellX[i]! - half;
        const y = cellY[i]! - half;
        ctx.drawImage(strips, sx, t * tile, width, tile, x, y, width, tile);
        k += run;
      }
    }
    ctx.globalAlpha = 1;
    drawn++;
    canvas.dataset.frames = String(drawn);
  };

  const shouldRun = () => !reducedMotion && !disposed && !!frames && visible && !document.hidden;

  const tick = (now: number) => {
    raf = 0;
    if (!shouldRun()) return sync();
    raf = requestAnimationFrame(tick);
    const interval = 1000 / profile.fps;
    // A little slack so a 60 Hz display isn't throttled to 30 by timer jitter.
    if (lastTick !== 0 && now - lastTick < interval - 2) return;
    const seconds = lastTick === 0 ? 1 / profile.fps : Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    motion = stepMotion(motion, targetX, targetY, seconds);
    spinPhase = (spinPhase + seconds * SPIN_BASE_SPEED) % (2 * Math.PI);
    draw();
  };

  // Starts or stops the loop to match the current conditions.
  const sync = () => {
    if (disposed) return;
    if (!frames) return setState("loading");
    if (reducedMotion) return setState("static");
    if (shouldRun()) {
      if (raf === 0) {
        lastTick = 0;
        raf = requestAnimationFrame(tick);
      }
      return setState("running");
    }
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    setState("paused");
  };

  // Paused and reduced-motion canvases still need a correct frame after a change.
  const redraw = () => {
    if (raf === 0) draw();
  };

  const onResize = () => {
    if (layout()) draw();
  };
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
  resizeObserver?.observe(canvas);

  const intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          visible = entry.isIntersecting;
          sync();
        });
  intersectionObserver?.observe(canvas);

  const onVisibility = () => sync();
  document.addEventListener("visibilitychange", onVisibility);

  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = toCanvas(event.clientX, event.clientY);
    if (!point) return;
    targetX = point.x;
    targetY = point.y;
  };
  const onPointerLeave = () => {
    targetX = 0.5;
    targetY = 0.5;
  };
  if (!reducedMotion) {
    pointerTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    pointerTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  }

  layout();
  setState("loading");

  resolveMascotFrames(source).then(
    (resolved) => {
      if (disposed) return;
      frames = resolved;
      draw();
      sync();
    },
    (error: unknown) => {
      if (disposed) return;
      console.error(error);
      setState("unsupported");
    },
  );

  // The atlas is drawn with the mono font, which may still be loading. Redraw once it is in.
  if (typeof document.fonts?.load === "function") {
    document.fonts.load(`700 16px ${fontFamily()}`, GLYPHS.join("")).then(
      () => {
        if (disposed) return;
        buildAtlas();
        redraw();
      },
      () => {},
    );
  }

  return {
    setActive(next) {
      if (disposed || next === active) return;
      active = next;
      if (frames && frames.active !== frames.idle) redraw();
    },
    pulse(x, y) {
      if (disposed || reducedMotion) return;
      motion = { ...motion, energy: 1 };
      targetX = x;
      targetY = y;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      pointerTarget.removeEventListener("pointermove", onPointerMove);
      pointerTarget.removeEventListener("pointerleave", onPointerLeave);
    },
  };
}
