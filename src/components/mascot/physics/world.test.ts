import Matter from "matter-js";
import { describe, expect, it } from "vitest";
import { createTokenWorld, WALL_THICKNESS } from "./world";

const W = 800;
const H = 600;
const R = 18;

/** A repeatable random source, so physics runs are deterministic. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const dynamicBodies = (world: ReturnType<typeof createTokenWorld>) =>
  Matter.Composite.allBodies(world.engine.world).filter((b) => !b.isStatic);

const run = (world: ReturnType<typeof createTokenWorld>, steps: number) => {
  for (let i = 0; i < steps; i++) world.step(1000 / 60);
};

describe("createTokenWorld", () => {
  it("spawnAt adds one dynamic token body at the point", () => {
    const world = createTokenWorld({ width: W, height: H, radius: R, random: seeded() });
    expect(dynamicBodies(world)).toHaveLength(0);

    const body = world.spawnAt(300, 200);

    expect(dynamicBodies(world)).toEqual([body]);
    expect(world.tokens).toEqual([body]);
    expect(body.position).toEqual({ x: 300, y: 200 });
    expect(body.circleRadius).toBe(R);
    expect(body.restitution).toBeGreaterThanOrEqual(0.55);
    expect(body.restitution).toBeLessThanOrEqual(0.65);
  });

  it("caps active bodies by removing the oldest first", () => {
    const world = createTokenWorld({
      width: W,
      height: H,
      radius: R,
      maxBodies: 3,
      random: seeded(),
    });
    const spawned = [1, 2, 3, 4, 5].map((i) => world.spawnAt(i * 100, 100));

    expect(world.tokens).toEqual(spawned.slice(2));
    expect(dynamicBodies(world).map((b) => b.id)).toEqual(spawned.slice(2).map((b) => b.id));
  });

  it("tokens fall, bounce, roll, and stack on the floor without overlapping", () => {
    const world = createTokenWorld({ width: W, height: H, radius: R, random: seeded(7) });
    const first = world.spawnAt(400, 100);
    let fell = false;
    let bounced = false;
    for (let i = 0; i < 60 * 8; i++) {
      world.step(1000 / 60);
      if (first.velocity.y > 2) fell = true;
      if (fell && first.velocity.y < -0.5) bounced = true;
      if (i % 10 === 0 && i < 200) world.spawnAt(400, 100);
    }

    expect(bounced).toBe(true);
    expect(world.tokens.length).toBe(21);
    for (const body of world.tokens) {
      expect(body.position.y).toBeLessThanOrEqual(H - R + 1);
      expect(body.position.x).toBeGreaterThanOrEqual(R - 1);
      expect(body.position.x).toBeLessThanOrEqual(W - R + 1);
    }
    // Stacked, not overlapping: centers are at least about one diameter apart.
    for (const [i, a] of world.tokens.entries()) {
      for (const b of world.tokens.slice(i + 1)) {
        const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        expect(d).toBeGreaterThan(2 * R * 0.9);
      }
    }
    // Some tokens sit above the floor row, resting on others.
    expect(world.tokens.some((b) => b.position.y < H - R * 2.5)).toBe(true);
    expect(world.tokens.some((b) => Math.abs(b.angle) > 0.1)).toBe(true);
  });

  it("resize rebuilds the floor and walls at the new edges and keeps tokens inside", () => {
    const world = createTokenWorld({ width: W, height: H, radius: R, random: seeded() });
    const old = world.walls;
    const kept = world.spawnAt(100, 300);
    const outside = world.spawnAt(700, 300);

    world.resize(375, 400);

    const { floor, left, right } = world.walls;
    const statics = Matter.Composite.allBodies(world.engine.world).filter((b) => b.isStatic);
    expect(statics).toHaveLength(3);
    expect(statics).not.toContain(old.floor);
    expect(statics).not.toContain(old.left);
    expect(statics).not.toContain(old.right);
    expect(floor.bounds.min.y).toBeCloseTo(400);
    expect(floor.bounds.min.x).toBeLessThanOrEqual(0);
    expect(floor.bounds.max.x).toBeGreaterThanOrEqual(375);
    expect(left.bounds.max.x).toBeCloseTo(0);
    expect(right.bounds.min.x).toBeCloseTo(375);
    expect(right.bounds.max.x - right.bounds.min.x).toBeCloseTo(WALL_THICKNESS);

    expect(kept.position).toEqual({ x: 100, y: 300 });
    expect(outside.position.x).toBeLessThanOrEqual(375 - R);
    run(world, 60 * 4);
    for (const body of world.tokens) {
      expect(body.position.y).toBeLessThanOrEqual(400 - R + 1);
      expect(body.position.x).toBeLessThanOrEqual(375 - R + 1);
    }
  });

  it("destroy empties the world", () => {
    const world = createTokenWorld({ width: W, height: H, radius: R, random: seeded() });
    world.spawnAt(100, 100);
    world.destroy();
    expect(Matter.Composite.allBodies(world.engine.world)).toHaveLength(0);
    expect(world.tokens).toHaveLength(0);
  });
});
