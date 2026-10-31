import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMascotRenderer, type MascotRenderer } from "./renderer";
import { installMascotTestEnv, type MascotTestEnv } from "./testEnv";
import * as source from "./source";

// The real frames, with the model's `turn` wrapped in a spy so tests can count the voxel renders.
const turn = vi.fn<NonNullable<source.MascotFrames["turn"]>>();
vi.mock("./source", async (importOriginal) => {
  const actual = await importOriginal<typeof source>();
  return {
    ...actual,
    resolveMascotFrames: async (visual: Parameters<typeof actual.resolveMascotFrames>[0]) => {
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

beforeEach(() => {
  env = installMascotTestEnv({ size: 400 });
  turn.mockClear();
});
afterEach(() => {
  renderer?.destroy();
  renderer = null;
  canvas.remove();
  env.restore();
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
    while (Number(canvas.dataset.angle) < 175) env.runFrame(100);
    turn.mockClear();
    let angle = canvas.dataset.angle;
    let changed = 0;
    for (let frame = 0; frame < 60; frame++) {
      const calls = turn.mock.calls.length;
      env.runFrame(1000 / 60);
      const next = canvas.dataset.angle;
      const turned = turn.mock.calls.length - calls;
      expect(turned, `frame ${frame}, ${angle}° to ${next}°`).toBe(next === angle ? 0 : 1);
      if (next !== angle) changed++;
      angle = next;
    }
    // The angle did move, and it held still on most frames, so most frames reused the last turn.
    expect(changed).toBeGreaterThan(3);
    expect(turn.mock.calls.length).toBe(changed);
    expect(changed).toBeLessThan(60 / 3);
    // Every turn was to the whole degree `data-angle` reports.
    for (const [radians] of turn.mock.calls) {
      const degrees = (radians * 180) / Math.PI;
      expect(Math.abs(degrees - Math.round(degrees))).toBeLessThan(1e-9);
    }
  });

  it("still turns on every frame where the angle moves a degree or more, edge-on", async () => {
    await start();
    // Skip ahead to just before edge-on (90°), where the turn hurries.
    while (Number(canvas.dataset.angle) < 80) env.runFrame(100);
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

  it("with reduced motion, shows the still pose and never turns the model", async () => {
    await start(true);
    expect(canvas.dataset.state).toBe("static");
    expect(canvas.dataset.angle).toBe("20");
    env.runFrame(1000);
    expect(turn).not.toHaveBeenCalled();
  });
});
