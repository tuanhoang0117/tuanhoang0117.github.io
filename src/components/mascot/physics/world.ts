import Matter from "matter-js";

const { Bodies, Body, Composite, Engine, Sleeping } = Matter;

/** Walls are thick so fast tokens can't tunnel through them in one step. */
export const WALL_THICKNESS = 200;
export const DEFAULT_MAX_BODIES = 200;

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
  spawnAt(x: number, y: number): Matter.Body;
  resize(width: number, height: number): void;
  step(deltaMs: number): void;
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

  const clampX = (x: number) => Math.min(Math.max(x, radius), Math.max(radius, width - radius));

  return {
    engine,
    tokens,
    get walls() {
      return walls;
    },

    spawnAt(x, y) {
      const body = Bodies.circle(clampX(x), Math.min(y, height - radius), radius, {
        restitution: 0.6,
        friction: 0.07,
        frictionAir: 0.01,
      });
      Body.setVelocity(body, { x: between(-3, 3), y: between(-5, -1) });
      Body.setAngularVelocity(body, between(-0.15, 0.15));
      Composite.add(engine.world, body);
      tokens.push(body);
      while (tokens.length > maxBodies) {
        Composite.remove(engine.world, tokens.shift()!);
      }
      return body;
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

    step(deltaMs) {
      Engine.update(engine, deltaMs);
    },

    destroy() {
      tokens.length = 0;
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}
