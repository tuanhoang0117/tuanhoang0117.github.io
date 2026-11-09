import Matter from "matter-js";
import type { ColliderRect } from "./colliders";

const { Bodies, Body, Composite, Engine, Sleeping } = Matter;

/** Walls are thick so fast tokens can't tunnel through them in one step. */
export const WALL_THICKNESS = 200;
export const DEFAULT_MAX_BODIES = 200;
/** How long a token lies still before it starts to fade. */
export const REST_BEFORE_FADE_MS = 10_000;
export const FADE_MS = 800;
/** A collider that moved wakes sleeping tokens within this many radii of it. */
const WAKE_REACH = 1.5;
/** Removing a token wakes those close enough to have been leaning on it. */
const SUPPORT_REACH = 2.5;
/** Boxes closer than this, in CSS pixels, count as not having moved. */
const MOVE_EPSILON = 0.25;
/**
 * A flung token's launch speed, in CSS pixels per 1/60 s step. Straight up at the top speed it
 * rises about 115px before falling, well short of the mascot's prompt and counter at xl (about
 * 200px above its center), so a fling never lands a token on them.
 */
export const FLING_MIN_SPEED = 4;
export const FLING_MAX_SPEED = 8;

export interface WorldOptions {
  width: number;
  height: number;
  /** Collision radius of every token, in CSS pixels. */
  radius: number;
  /** Active tokens allowed at once. Past this, the oldest token is removed. */
  maxBodies?: number;
  /** Injected for deterministic tests. */
  random?: () => number;
}

export interface Walls {
  floor: Matter.Body;
  left: Matter.Body;
  right: Matter.Body;
}

export interface TokenWorld {
  engine: Matter.Engine;
  /** Live tokens, oldest first. */
  readonly tokens: readonly Matter.Body[];
  readonly walls: Walls;
  /** Static bodies for page elements, in the order given to `setColliders`. */
  readonly colliders: readonly Matter.Body[];
  /** Drops a token at a point, with a small random toss. */
  spawnAt(x: number, y: number): Matter.Body;
  /**
   * Launches a token from a point in a random direction, at a random speed between
   * `FLING_MIN_SPEED` and `FLING_MAX_SPEED`. Same body, cap, and colliders as `spawnAt`.
   */
  flingFrom(x: number, y: number): Matter.Body;
  resize(width: number, height: number): void;
  /**
   * Makes the page's elements match these boxes. Sleeping tokens near anything that moved wake up,
   * so they follow it; the rest stay asleep. Nothing happens when nothing moved.
   */
  setColliders(rects: readonly ColliderRect[]): void;
  step(deltaMs: number): void;
  /** Advances the rest clocks by real elapsed time, removing tokens that have finished fading. */
  age(elapsedMs: number): void;
  /** 1 until a token starts to fade, then down toward 0. */
  opacityOf(body: Matter.Body): number;
  /** How long until the next token starts to fade (0 while one is fading), if any is resting. */
  untilNextFade(): number | undefined;
  destroy(): void;
}

function makeWalls(width: number, height: number): Walls {
  const t = WALL_THICKNESS;
  const options = { isStatic: true, friction: 0.3, restitution: 0.2 };
  // Side walls run far above the viewport so tokens tossed upward still land inside.
  const tall = height * 3 + t * 2;
  return {
    floor: Bodies.rectangle(width / 2, height + t / 2, width + t * 2, t, options),
    left: Bodies.rectangle(-t / 2, height - tall / 2, t, tall, options),
    right: Bodies.rectangle(width + t / 2, height - tall / 2, t, tall, options),
  };
}

const sameSize = (a: ColliderRect, b: ColliderRect) =>
  Math.abs(a.width - b.width) < MOVE_EPSILON && Math.abs(a.height - b.height) < MOVE_EPSILON;

const sameBox = (a: ColliderRect, b: ColliderRect) =>
  sameSize(a, b) && Math.abs(a.x - b.x) < MOVE_EPSILON && Math.abs(a.y - b.y) < MOVE_EPSILON;

const centerOf = (rect: ColliderRect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

export function createTokenWorld(options: WorldOptions): TokenWorld {
  const random = options.random ?? Math.random;
  const maxBodies = Math.max(1, options.maxBodies ?? DEFAULT_MAX_BODIES);
  const radius = options.radius;
  const between = (lo: number, hi: number) => lo + (hi - lo) * random();

  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.x = 0;
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;

  let width = options.width;
  let height = options.height;
  let walls = makeWalls(width, height);
  Composite.add(engine.world, [walls.floor, walls.left, walls.right]);
  const tokens: Matter.Body[] = [];
  const restedMs = new Map<Matter.Body, number>();
  let colliders: Matter.Body[] = [];
  let colliderRects: ColliderRect[] = [];

  const clampX = (x: number) => Math.min(Math.max(x, radius), Math.max(radius, width - radius));

  /**
   * Matter leaves a sleeping body hanging in the air when what held it up disappears, and a token
   * falling away from one stacked on it doesn't wake it either. So waking spreads from token to
   * token through every one close enough to be leaning on another, starting from these points.
   */
  const wakeFrom = (points: readonly Matter.Vector[]) => {
    const queue = [...points];
    for (let point = queue.pop(); point; point = queue.pop()) {
      for (const other of tokens) {
        if (!other.isSleeping) continue;
        const distance = Math.hypot(other.position.x - point.x, other.position.y - point.y);
        if (distance > radius * SUPPORT_REACH) continue;
        Sleeping.set(other, false);
        queue.push(other.position);
      }
    }
  };

  const removeToken = (body: Matter.Body) => {
    Composite.remove(engine.world, body);
    restedMs.delete(body);
    tokens.splice(tokens.indexOf(body), 1);
    wakeFrom([body.position]);
  };

  /**
   * A body stops one token's height above the floor, so the floor's row of tokens always fits
   * under it. Otherwise a page element scrolling down would crush that row into the floor.
   */
  const fitAboveFloor = (rect: ColliderRect): ColliderRect | undefined => {
    const bottom = Math.min(rect.y + rect.height, height - radius * 2);
    return bottom > rect.y ? { ...rect, height: bottom - rect.y } : undefined;
  };

  const wakeNear = (rect: ColliderRect) => {
    const reach = radius * WAKE_REACH;
    const touching = tokens.filter((body) => {
      const { x, y } = body.position;
      const dx = Math.max(rect.x - x, 0, x - rect.x - rect.width);
      const dy = Math.max(rect.y - y, 0, y - rect.y - rect.height);
      return body.isSleeping && Math.hypot(dx, dy) <= reach;
    });
    for (const body of touching) Sleeping.set(body, false);
    wakeFrom(touching.map((body) => body.position));
  };

  const makeCollider = (rect: ColliderRect) => {
    const { x, y } = centerOf(rect);
    const body = Bodies.rectangle(x, y, rect.width, rect.height, {
      isStatic: true,
      label: "collider",
    });
    Composite.add(engine.world, body);
    return body;
  };

  const addToken = (x: number, y: number, velocity: Matter.Vector) => {
    const body = Bodies.circle(clampX(x), Math.min(y, height - radius), radius, {
      restitution: 0.6,
      friction: 0.07,
      frictionAir: 0.01,
    });
    Body.setVelocity(body, velocity);
    Body.setAngularVelocity(body, between(-0.15, 0.15));
    Composite.add(engine.world, body);
    tokens.push(body);
    while (tokens.length > maxBodies) removeToken(tokens[0]!);
    return body;
  };

  return {
    engine,
    tokens,
    get walls() {
      return walls;
    },
    get colliders() {
      return colliders;
    },

    spawnAt(x, y) {
      return addToken(x, y, { x: between(-3, 3), y: between(-5, -1) });
    },

    flingFrom(x, y) {
      const direction = between(0, 2 * Math.PI);
      const speed = between(FLING_MIN_SPEED, FLING_MAX_SPEED);
      return addToken(x, y, { x: Math.cos(direction) * speed, y: Math.sin(direction) * speed });
    },

    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      Composite.remove(engine.world, [walls.floor, walls.left, walls.right]);
      walls = makeWalls(width, height);
      Composite.add(engine.world, [walls.floor, walls.left, walls.right]);
      // Keep tokens that fit; pull the rest back inside the new bounds and let them fall again.
      for (const body of tokens) {
        const x = clampX(body.position.x);
        const y = Math.min(body.position.y, height - radius);
        if (x !== body.position.x || y !== body.position.y) {
          // Jitter so tokens clamped to the same spot don't sit exactly on top of each other.
          Body.setPosition(body, { x: clampX(x + between(-1, 1) * radius), y });
          Body.setVelocity(body, { x: 0, y: 0 });
        }
        Sleeping.set(body, false);
      }
    },

    setColliders(rects) {
      const fitted = rects.flatMap((rect) => fitAboveFloor(rect) ?? []);
      const next: Matter.Body[] = [];
      for (let i = 0; i < Math.max(fitted.length, colliderRects.length); i++) {
        const before = colliderRects[i];
        const after = fitted[i];
        const body = colliders[i];
        if (before && after && body && sameBox(before, after)) {
          next.push(body);
          continue;
        }
        if (before) wakeNear(before);
        if (after) wakeNear(after);
        if (before && after && body && sameSize(before, after)) {
          // Moving a body in place keeps its contacts, so a token riding a word stays calm.
          Body.setPosition(body, centerOf(after));
          next.push(body);
          continue;
        }
        if (body) Composite.remove(engine.world, body);
        if (after) next.push(makeCollider(after));
      }
      colliders = next;
      colliderRects = fitted;
    },

    step(deltaMs) {
      Engine.update(engine, deltaMs);
    },

    age(elapsedMs) {
      for (const body of [...tokens]) {
        const rested = body.isSleeping ? (restedMs.get(body) ?? 0) + elapsedMs : 0;
        if (rested >= REST_BEFORE_FADE_MS + FADE_MS) removeToken(body);
        else restedMs.set(body, rested);
      }
    },

    opacityOf(body) {
      const fading = (restedMs.get(body) ?? 0) - REST_BEFORE_FADE_MS;
      return fading <= 0 ? 1 : Math.max(0, 1 - fading / FADE_MS);
    },

    untilNextFade() {
      const waits = tokens
        .filter((body) => body.isSleeping)
        .map((body) => REST_BEFORE_FADE_MS - (restedMs.get(body) ?? 0));
      return waits.length > 0 ? Math.max(0, Math.min(...waits)) : undefined;
    },

    destroy() {
      tokens.length = 0;
      restedMs.clear();
      colliders = [];
      colliderRects = [];
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}
