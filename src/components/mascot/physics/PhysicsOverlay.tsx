import type Matter from "matter-js";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "../../../pixel/useReducedMotion";
import { animationsSettled, measureColliders } from "./colliders";
import { rotationStep } from "./raster";
import { createTokenFrames } from "./tokenFrames";
import { tokenArt, tokenVisual, type TokenVisual } from "./tokenVisual";
import { createTokenWorld, DEFAULT_MAX_BODIES } from "./world";

export interface PhysicsOverlayHandle {
  /** Drops one token at a viewport (client) coordinate. Does nothing under reduced motion. */
  spawnAt(x: number, y: number): void;
}

interface PhysicsOverlayProps {
  ref?: Ref<PhysicsOverlayHandle>;
  visual?: TokenVisual;
  maxBodies?: number;
}

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;
/** Fading steps through a few levels, like the rotation's frames, instead of a smooth ramp. */
const FADE_LEVELS = 4;

/** Where a frame's painted pixels sit inside it, in device pixels. */
interface PaintedBox {
  left: number;
  right: number;
  bottom: number;
}

function paintedBox(image: HTMLCanvasElement): PaintedBox | undefined {
  const { width, height } = image;
  const data = image.getContext("2d")?.getImageData(0, 0, width, height).data;
  if (!data) return undefined;
  let box: PaintedBox | undefined;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      box ??= { left: x, right: x + 1, bottom: y + 1 };
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x + 1);
      box.bottom = y + 1;
    }
  }
  return box;
}

/**
 * One transparent, full-viewport Matter.js layer of falling tokens that land on the page's
 * headings and blocks (colliders.ts). It never takes pointer events, so everything under it stays
 * clickable. Spawn tokens through the ref's `spawnAt`.
 */
export function PhysicsOverlay({
  ref,
  visual = tokenVisual,
  maxBodies = DEFAULT_MAX_BODIES,
}: PhysicsOverlayProps) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spawnRef = useRef<(x: number, y: number) => void>(() => {});

  useImperativeHandle(ref, () => ({ spawnAt: (x, y) => spawnRef.current(x, y) }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (reduced || !canvas) return;

    const art = tokenArt(visual);
    const frames = createTokenFrames(art);
    const variantOf = new WeakMap<Matter.Body, number>();
    let nextVariant = 0;
    const ctx = canvas.getContext("2d");
    const measure = (entry?: ResizeObserverEntry) => ({
      width: entry?.contentRect.width || canvas.clientWidth || window.innerWidth,
      height: entry?.contentRect.height || canvas.clientHeight || window.innerHeight,
    });
    let size = measure();
    const world = createTokenWorld({ ...size, radius: art.radius, maxBodies });

    // Drawing happens in device pixels, so each art pixel covers a whole number of them even at
    // fractional ratios like 2.625. Physics stays in CSS pixels.
    let dpr = 1;
    let pixel = 0;
    const fitCanvas = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      const nextPixel = Math.max(1, Math.round(art.scale * dpr));
      if (nextPixel !== pixel) frames.setPixelSize((pixel = nextPixel));
      // Resizing a canvas resets its state, smoothing included.
      if (ctx) ctx.imageSmoothingEnabled = false;
    };

    // The collision circle fits the art unrotated, but a rotated sprite's corners reach past it,
    // and the viewport's edge would cut them off. Those tokens are drawn just inside instead. Only
    // frames near an edge get their pixels read, once each.
    const painted = new WeakMap<HTMLCanvasElement, PaintedBox | null>();
    const paintedIn = (image: HTMLCanvasElement) => {
      let box = painted.get(image);
      if (box === undefined) painted.set(image, (box = paintedBox(image) ?? null));
      return box;
    };
    const insideViewport = (image: HTMLCanvasElement, x: number, y: number) => {
      const crossesEdge =
        x < 0 || x + image.width > canvas.width || y + image.height > canvas.height;
      const box = crossesEdge ? paintedIn(image) : null;
      if (!box) return { x, y };
      return {
        x: Math.max(-box.left, Math.min(x, canvas.width - box.right)),
        y: Math.min(y, canvas.height - box.bottom),
      };
    };

    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const half = frames.side / 2;
      for (const body of world.tokens) {
        const image = frames.frame(variantOf.get(body) ?? 0, rotationStep(body.angle));
        if (!image) continue;
        const { x, y } = insideViewport(
          image,
          Math.round(body.position.x * dpr - half),
          Math.round(body.position.y * dpr - half),
        );
        ctx.globalAlpha = Math.ceil(world.opacityOf(body) * FADE_LEVELS) / FADE_LEVELS;
        ctx.drawImage(image, x, y);
      }
      ctx.globalAlpha = 1;
      canvas.dataset.tokens = String(world.tokens.length);
    };

    // Colliders are re-read only after something could have moved them, and at most once a frame
    // however many steps that frame runs. With no tokens there's nothing to collide, so reads wait
    // for the next press.
    let collidersStale = true;
    const syncColliders = () => {
      collidersStale = false;
      world.setColliders(measureColliders());
      canvas.dataset.colliders = String(world.colliders.length);
    };

    // The rest clock runs on real time, because the loop isn't running while tokens rest. It
    // doesn't count time the tab is hidden.
    let aged = performance.now();
    const age = () => {
      const now = performance.now();
      world.age(now - aged);
      aged = now;
    };

    // The loop runs only while something moves or fades: it stops once every token sleeps, and
    // while the tab is hidden. A timer brings it back when the next resting token is due to fade.
    let frame = 0;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let last: number | undefined;
    let pending = 0;
    const tick = (now: number) => {
      frame = 0;
      if (collidersStale && world.tokens.length > 0) syncColliders();
      age();
      pending += Math.min(now - (last ?? now), STEP_MS * MAX_STEPS_PER_FRAME);
      last = now;
      for (let i = 0; pending >= STEP_MS && i < MAX_STEPS_PER_FRAME; i++) {
        world.step(STEP_MS);
        pending -= STEP_MS;
      }
      draw();
      const resting = world.tokens.every((body) => body.isSleeping);
      canvas.dataset.resting = String(resting);
      clearTimeout(fadeTimer);
      fadeTimer = undefined;
      if (!resting) {
        start();
      } else {
        // Physics is idle until then, so the next frame's clock starts fresh. While a token fades
        // the wait is zero, which keeps frames coming.
        last = undefined;
        pending = 0;
        const wait = world.untilNextFade();
        if (wait !== undefined) fadeTimer = setTimeout(schedule, wait);
      }
    };
    /** Runs one more frame without announcing that anything moved. */
    const schedule = () => {
      if (frame || document.hidden) return;
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (document.hidden) return;
      canvas.dataset.resting = "false";
      schedule();
    };
    const collidersMoved = () => {
      collidersStale = true;
      if (world.tokens.length > 0) schedule();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      clearTimeout(fadeTimer);
      fadeTimer = undefined;
      frame = 0;
      last = undefined;
      pending = 0;
    };

    const resize = (entry?: ResizeObserverEntry) => {
      size = measure(entry);
      fitCanvas();
      world.resize(size.width, size.height);
      collidersStale = true;
      draw();
      start();
    };
    const onResize = () => resize();
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      aged = performance.now();
      start();
    };

    fitCanvas();
    draw();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    // Capture, because scroll events don't bubble and any scrolling ancestor can move the page.
    window.addEventListener("scroll", collidersMoved, { capture: true, passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver((entries) => {
            for (const entry of entries) {
              if (entry.target === canvas) resize(entry);
              else collidersMoved();
            }
          });
    resizeObserver?.observe(canvas);
    // The page's own box changes when its content reflows, with no window resize to announce it.
    resizeObserver?.observe(document.documentElement);

    let mounted = true;
    const whenSettled = () => {
      if (mounted) collidersMoved();
    };
    void animationsSettled().then(whenSettled);
    void document.fonts?.ready.then(whenSettled);

    spawnRef.current = (x, y) => {
      variantOf.set(world.spawnAt(x, y), nextVariant++ % Math.max(1, art.variants.length));
      // The press may have changed the page, like the counter gaining a digit. The next frame reads
      // it before the new token moves.
      collidersStale = true;
      draw();
      start();
    };

    return () => {
      mounted = false;
      spawnRef.current = () => {};
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", collidersMoved, { capture: true });
      resizeObserver?.disconnect();
      world.destroy();
      frames.release();
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [reduced, visual, maxBodies]);

  if (reduced) return null;

  const canvas = (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="physics-overlay"
      data-tokens="0"
      data-colliders="0"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
  return typeof document === "undefined" ? canvas : createPortal(canvas, document.body);
}
