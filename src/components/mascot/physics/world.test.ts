import Matter from "matter-js";
import { describe, expect, it } from "vitest";
import { createTokenWorld, FADE_MS, REST_BEFORE_FADE_MS, WALL_THICKNESS } from "./world";

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

describe("page colliders", () => {
  const WORD = { x: 200, y: 300, width: 300, height: 80 };
  const newWorld = () => createTokenWorld({ width: W, height: H, radius: R, random: seeded(3) });
  const asleepAfter = (world: ReturnType<typeof createTokenWorld>, steps = 60 * 8) => {
    run(world, steps);
    expect(world.tokens.every((b) => b.isSleeping)).toBe(true);
  };
  /** A token with no sideways toss, so where it lands doesn't depend on the random source. */
  const dropStraight = (world: ReturnType<typeof createTokenWorld>, x: number, y: number) => {
    const token = world.spawnAt(x, y);
    Matter.Body.setVelocity(token, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(token, 0);
    return token;
  };

  it("makes a static body for each box", () => {
    const world = newWorld();
    world.setColliders([WORD, { ...WORD, x: 600, width: 100 }]);

    expect(world.colliders).toHaveLength(2);
    const [word] = world.colliders;
    expect(word!.isStatic).toBe(true);
    expect(word!.bounds.min).toEqual({ x: 200, y: 300 });
    expect(word!.bounds.max).toEqual({ x: 500, y: 380 });
  });

  it("a token falling onto a body bounces and comes to rest on top of it", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    const token = dropStraight(world, 350, 150);

    let fell = false;
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      world.step(1000 / 60);
      if (token.velocity.y > 2) fell = true;
      if (fell && token.velocity.y < -0.5) bounced = true;
    }
    asleepAfter(world);

    expect(bounced).toBe(true);
    expect(token.position.y).toBeCloseTo(WORD.y - R, 0);
  });

  it("a token rolls off the end of a body and carries on to the floor", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    // Its center just past the corner, so the corner tips it off.
    const token = dropStraight(world, WORD.x - 3, 200);
    let fell = false;
    for (let i = 0; i < 60 * 8; i++) {
      world.step(1000 / 60);
      if (token.position.y > WORD.y + WORD.height) fell = true;
    }

    expect(fell).toBe(true);
    expect(token.position.x).toBeLessThan(WORD.x);
    expect(token.position.y).toBeCloseTo(H - R, 0);
    expect(Math.abs(token.angle)).toBeGreaterThan(0.1);
  });

  it("a token that misses every body reaches the floor", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    const token = world.spawnAt(700, 200);
    asleepAfter(world);
    expect(token.position.y).toBeCloseTo(H - R, 0);
  });

  it("does nothing, and wakes nothing, when the boxes haven't moved", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    const onWord = dropStraight(world, 350, 200);
    asleepAfter(world);
    const before = world.colliders[0];

    world.setColliders([{ ...WORD, y: WORD.y + 0.1 }]);

    expect(world.colliders[0]).toBe(before);
    expect(onWord.isSleeping).toBe(true);
  });

  it("a token follows a body that moves down, and is carried by one moving up", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    const token = dropStraight(world, 350, 200);
    asleepAfter(world);

    world.setColliders([{ ...WORD, y: WORD.y + 40 }]);
    expect(token.isSleeping).toBe(false);
    asleepAfter(world);
    expect(token.position.y).toBeCloseTo(WORD.y + 40 - R, 0);

    // Scrolling up in small steps, as a real scroll does.
    for (let shift = 35; shift >= -40; shift -= 5) {
      world.setColliders([{ ...WORD, y: WORD.y + shift }]);
      run(world, 1);
    }
    asleepAfter(world);
    expect(token.position.y).toBeCloseTo(WORD.y - 40 - R, 0);
  });

  it("a moved body leaves sleeping tokens far from it asleep", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    const far = world.spawnAt(700, 200);
    asleepAfter(world);

    world.setColliders([{ ...WORD, y: WORD.y + 40 }]);

    expect(far.isSleeping).toBe(true);
  });

  it("removes bodies that disappear and drops the tokens they held", () => {
    const world = newWorld();
    world.setColliders([WORD, { ...WORD, x: 600, width: 100 }]);
    const token = dropStraight(world, 350, 200);
    asleepAfter(world);

    world.setColliders([]);

    expect(world.colliders).toHaveLength(0);
    expect(Matter.Composite.allBodies(world.engine.world).filter((b) => b.isStatic)).toHaveLength(
      3,
    );
    asleepAfter(world);
    expect(token.position.y).toBeCloseTo(H - R, 0);
  });

  it("drops tokens stacked on others too, not only those touching the body", () => {
    const world = newWorld();
    // A slot on top of the word, just wider than a token, so tokens dropped in it stand in a
    // column. Each touches only its neighbours: the top one is two steps from the word.
    const x = 350;
    const slot = [
      { x: x - R - 1 - 10, y: WORD.y - R * 8, width: 10, height: R * 8 },
      { x: x + R + 1, y: WORD.y - R * 8, width: 10, height: R * 8 },
    ];
    world.setColliders([...slot, WORD]);
    for (let i = 0; i < 3; i++) {
      dropStraight(world, x, WORD.y - R - i * R * 2);
      asleepAfter(world);
    }
    const top = world.tokens.at(-1)!;
    expect(top.position.y, "the top token stands two tokens up").toBeLessThan(WORD.y - R * 4.5);

    // The slot stays; only the word goes.
    world.setColliders(slot);
    asleepAfter(world);

    const highest = Math.min(...world.tokens.map((token) => token.position.y));
    expect(highest, "every token fell past where the word was").toBeGreaterThan(
      WORD.y + WORD.height,
    );
  });

  it("replaces a body whose size changed", () => {
    const world = newWorld();
    world.setColliders([WORD]);
    world.setColliders([{ ...WORD, width: 100 }]);
    expect(world.colliders[0]!.bounds.max.x).toBe(WORD.x + 100);
    expect(Matter.Composite.allBodies(world.engine.world).filter((b) => b.isStatic)).toHaveLength(
      4,
    );
  });

  it("always leaves room for a row of tokens above the floor", () => {
    const world = newWorld();
    const limit = H - R * 2;
    world.setColliders([
      { x: 100, y: limit - 50, width: 100, height: 500 },
      { x: 300, y: limit + 1, width: 100, height: 50 },
    ]);

    expect(world.colliders).toHaveLength(1);
    expect(world.colliders[0]!.bounds.max.y).toBe(limit);
  });

  it("tokens on the floor aren't crushed by a body scrolling down onto them", () => {
    const world = newWorld();
    const token = dropStraight(world, 350, H - R * 2);
    asleepAfter(world);
    const restingAt = token.position.y;

    let lowest = restingAt;
    let highest = restingAt;
    for (let y = H - 300; y < H + 100; y += 10) {
      world.setColliders([{ ...WORD, y }]);
      run(world, 1);
      lowest = Math.max(lowest, token.position.y);
      highest = Math.min(highest, token.position.y);
    }

    // It stays in its row: never pushed into the floor, and never squeezed up out of it.
    expect(lowest - restingAt).toBeLessThan(1);
    expect(restingAt - highest).toBeLessThan(1);
  });
});

describe("resting and fading", () => {
  const newWorld = (maxBodies?: number) =>
    createTokenWorld({ width: W, height: H, radius: R, maxBodies, random: seeded(5) });
  const settle = (world: ReturnType<typeof createTokenWorld>) => {
    run(world, 60 * 8);
    expect(world.tokens.every((b) => b.isSleeping)).toBe(true);
  };

  it("keeps a resting token fully visible until the rest time passes", () => {
    const world = newWorld();
    const token = world.spawnAt(300, 500);
    settle(world);
    expect(REST_BEFORE_FADE_MS).toBe(10_000);
    expect(world.untilNextFade()).toBe(REST_BEFORE_FADE_MS);

    world.age(REST_BEFORE_FADE_MS - 1);

    expect(world.opacityOf(token)).toBe(1);
    expect(world.untilNextFade()).toBe(1);
  });

  it("fades a token out, then removes it from the world", () => {
    const world = newWorld();
    const token = world.spawnAt(300, 500);
    settle(world);

    world.age(REST_BEFORE_FADE_MS + FADE_MS / 2);
    expect(world.untilNextFade()).toBe(0);
    expect(world.opacityOf(token)).toBeCloseTo(0.5);
    expect(world.tokens).toEqual([token]);

    world.age(FADE_MS / 2);
    expect(world.tokens).toEqual([]);
    expect(dynamicBodies(world)).toEqual([]);
    expect(world.untilNextFade()).toBeUndefined();
  });

  it("never fades a token that's still moving", () => {
    const world = newWorld();
    const token = world.spawnAt(300, 100);
    world.age(REST_BEFORE_FADE_MS * 3);
    expect(world.tokens).toEqual([token]);
    expect(world.opacityOf(token)).toBe(1);
    expect(world.untilNextFade()).toBeUndefined();
  });

  it("restarts the rest clock when a token wakes", () => {
    const world = newWorld();
    const token = world.spawnAt(300, 500);
    settle(world);
    world.age(REST_BEFORE_FADE_MS - 100);

    Matter.Sleeping.set(token, false);
    world.age(1);
    settle(world);

    expect(world.untilNextFade()).toBe(REST_BEFORE_FADE_MS);
  });

  it("removing a faded token wakes one resting on it, so it doesn't hang in the air", () => {
    const world = newWorld();
    const lower = world.spawnAt(300, H - R);
    settle(world);
    world.age(REST_BEFORE_FADE_MS - 100);
    const upper = world.spawnAt(lower.position.x, H - R * 3 - 10);
    Matter.Body.setVelocity(upper, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(upper, 0);
    Matter.Body.setPosition(lower, lower.position);
    settle(world);
    expect(upper.position.y).toBeLessThan(H - R * 2);

    world.age(200 + FADE_MS);
    expect(world.tokens).toEqual([upper]);
    expect(upper.isSleeping).toBe(false);
    settle(world);
    expect(upper.position.y).toBeCloseTo(H - R, 0);
  });

  it("removing a token at the cap wakes one resting on it too", () => {
    const world = newWorld(2);
    const lower = world.spawnAt(300, H - R);
    Matter.Body.setVelocity(lower, { x: 0, y: 0 });
    settle(world);
    const upper = world.spawnAt(lower.position.x, H - R * 3 - 10);
    Matter.Body.setVelocity(upper, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(upper, 0);
    settle(world);
    expect(upper.position.y).toBeLessThan(H - R * 2);

    world.spawnAt(700, 100);

    expect(world.tokens).not.toContain(lower);
    expect(upper.isSleeping).toBe(false);
  });
});
