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
} from "./sampling";
import { resolveMascotFrames, type MascotFrames } from "./source";

/** Share of the canvas's shorter side the mascot covers, leaving room for parallax to move. */
const COVER = 0.94;
const GLYPHS = [...FILL_RAMP, ...OUTLINE_RAMP];

/**
 * Lighter settings for devices that would struggle: fewer frames and a smaller backing store.
 * `deviceMemory` is Chromium-only; elsewhere only the core count decides.
 */
function deviceProfile() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const low = (nav.deviceMemory ?? 8) < 4 || (nav.hardwareConcurrency ?? 8) < 4;
  return low ? { fps: 30, maxDpr: 1.5 } : { fps: 60, maxDpr: 3 };
}

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

  // Grid, rebuilt on resize. Positions are in device pixels; u/v index the source; sx/sy place
  // the cell on the canvas (0–1) for the wave and the pointer distance.
  let cells = 0;
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
    }
    return true;
  };

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!frames || !atlas || cells === 0) return;
    const raster = active ? frames.active : frames.idle;
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
      for (let k = starts[l]!; k < ends[l]!; k++) {
        const i = order[k]!;
        const t = cellTile[i]!;
        const sx = (t % GLYPHS.length) * tile;
        const sy = Math.floor(t / GLYPHS.length) * tile;
        ctx.drawImage(atlas, sx, sy, tile, tile, cellX[i]! - half, cellY[i]! - half, tile, tile);
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
