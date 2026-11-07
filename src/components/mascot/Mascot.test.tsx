import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mascotLabel } from "../../content/mascot";
import { Mascot, PRESS_MS } from "./Mascot";
import { installMascotTestEnv, preferReducedMotion, type MascotTestEnv } from "./testEnv";

let env: MascotTestEnv;

// Lets the source resolve (a promise) and React commit.
const settle = () => act(async () => {});
const canvas = () => document.querySelector("canvas")!;
const mascot = () => screen.getByRole("button", { name: mascotLabel });

beforeEach(() => {
  env = installMascotTestEnv({ size: 400 });
  preferReducedMotion(false);
});
afterEach(() => env.restore());

describe("Mascot", () => {
  it("is one button named by mascotLabel, with the canvas hidden from assistive tech", async () => {
    render(<Mascot />);
    await settle();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(mascot()).toHaveAccessibleName(mascotLabel);
    expect(canvas()).toHaveAttribute("aria-hidden", "true");
  });

  it("draws glyph cells once the source resolves, and keeps animating", async () => {
    render(<Mascot />);
    expect(canvas().dataset.state).toBe("loading");
    await settle();
    expect(canvas().dataset.state).toBe("running");
    expect(env.drawImage).toHaveBeenCalled();
    const before = env.drawImage.mock.calls.length;
    act(() => env.runFrame());
    act(() => env.runFrame());
    expect(env.drawImage.mock.calls.length).toBeGreaterThan(before);
    expect(env.pendingFrames()).toBe(1);
  });

  it("spins the model through a full turn, lingering near the profiles", async () => {
    render(<Mascot />);
    await settle();
    // The spin starts from the rest pose, about 20° from side-on.
    expect(canvas().dataset.angle).toBe("20");
    // Which cells are painted: the silhouette. The wave changes glyphs every frame; only the
    // turning model changes this.
    const silhouette = () =>
      env.drawImage.mock.calls
        .map(([, , , , , dx, dy]) => `${dx},${dy}`)
        .sort()
        .join(" ");

    // One full turn (12 s) in tenths of a second. Per step: the angle it started from and how far
    // it went, in whole degrees as `data-angle` reports them.
    const steps: { from: number; turned: number }[] = [];
    const silhouettes = new Set<string>();
    let angle = 20;
    for (let i = 0; i < 120; i++) {
      env.drawImage.mockClear();
      act(() => env.runFrame(100));
      const next = Number(canvas().dataset.angle);
      steps.push({ from: angle, turned: (next - angle + 360) % 360 });
      silhouettes.add(silhouette());
      angle = next;
    }
    // Always forward (rounding to whole degrees can hide a step at the slowest point, never
    // reverse one), and all the way round.
    for (const { turned } of steps) expect(turned).toBeLessThan(180);
    const total = steps.reduce((sum, { turned }) => sum + turned, 0);
    expect(total).toBeGreaterThanOrEqual(358);
    expect(total).toBeLessThanOrEqual(362);
    // The glyphs follow the model: the painted outline changes many times over the turn.
    expect(silhouettes.size).toBeGreaterThan(30);

    // Average degrees per step near a profile (0°/180°) and near edge-on (90°/270°).
    const offProfile = (a: number) => Math.min(a % 180, 180 - (a % 180));
    const rate = (keep: (a: number) => boolean) => {
      const picked = steps.filter(({ from }) => keep(from));
      expect(picked.length).toBeGreaterThan(0);
      return picked.reduce((sum, { turned }) => sum + turned, 0) / picked.length;
    };
    const nearProfile = rate((a) => offProfile(a) <= 15);
    const nearEdge = rate((a) => offProfile(a) >= 75);
    expect(nearProfile).toBeGreaterThan(0);
    expect(nearProfile * 4).toBeLessThan(nearEdge);
  });

  it("sizes the backing store to the device pixel ratio, so glyphs aren't upscaled", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    render(<Mascot />);
    await settle();
    expect(canvas().width).toBe(800);
    expect(canvas().height).toBe(800);
  });

  it("copies every glyph at whole device pixels and at the atlas's own size", async () => {
    vi.stubGlobal("devicePixelRatio", 1.5);
    render(<Mascot />);
    await settle();
    expect(env.drawImage.mock.calls.length).toBeGreaterThan(100);
    for (const [, sx, sy, sw, sh, dx, dy, dw, dh] of env.drawImage.mock.calls) {
      for (const n of [sx, sy, dx, dy]) expect(Number.isInteger(n)).toBe(true);
      expect([dw, dh]).toEqual([sw, sh]);
    }
  });

  it("a click fires onActivate once, at the pointer, with press feedback", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const onActivate = vi.fn();
      render(<Mascot onActivate={onActivate} />);
      await settle();

      fireEvent.click(mascot(), { detail: 1, clientX: 120, clientY: 80 });

      expect(onActivate).toHaveBeenCalledExactlyOnceWith({ x: 120, y: 80, input: "pointer" });
      expect(mascot()).toHaveAttribute("data-pressed");
      act(() => vi.advanceTimersByTime(PRESS_MS));
      expect(mascot()).not.toHaveAttribute("data-pressed");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["{Enter}", " "])("%s fires onActivate once, from the center", async (key) => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Mascot onActivate={onActivate} />);
    await settle();

    mascot().focus();
    await user.keyboard(key);

    expect(onActivate).toHaveBeenCalledExactlyOnceWith({ x: 200, y: 200, input: "keyboard" });
    expect(mascot()).toHaveAttribute("data-pressed");
  });

  it("pauses when scrolled off-screen and resumes when back", async () => {
    render(<Mascot />);
    await settle();
    const [observer] = env.intersections;
    expect(observer!.observed).toContain(canvas());

    act(() => observer!.trigger(false));
    expect(canvas().dataset.state).toBe("paused");
    expect(env.pendingFrames()).toBe(0);

    act(() => observer!.trigger(true));
    expect(canvas().dataset.state).toBe("running");
    expect(env.pendingFrames()).toBe(1);
  });

  it("pauses while the tab is hidden", async () => {
    render(<Mascot />);
    await settle();

    act(() => env.setHidden(true));
    expect(canvas().dataset.state).toBe("paused");
    expect(env.pendingFrames()).toBe(0);

    act(() => env.setHidden(false));
    expect(canvas().dataset.state).toBe("running");
    expect(env.pendingFrames()).toBe(1);
  });

  it("leaves no frames, observers, or listeners behind after unmount in Strict Mode", async () => {
    const { unmount } = render(
      <StrictMode>
        <Mascot />
      </StrictMode>,
    );
    await settle();
    act(() => env.runFrame());
    expect(env.pendingFrames()).toBe(1);
    expect(env.liveListeners().length).toBeGreaterThan(0);
    // Strict Mode mounted the effect twice; only the second renderer is live.
    expect(env.intersections.filter((o) => !o.disconnected)).toHaveLength(1);
    expect(env.resizes.filter((o) => !o.disconnected)).toHaveLength(1);

    unmount();

    expect(env.pendingFrames()).toBe(0);
    expect(env.liveListeners()).toEqual([]);
    expect(env.intersections.length).toBeGreaterThan(0);
    for (const o of [...env.intersections, ...env.resizes]) expect(o.disconnected).toBe(true);
  });

  it("draws nothing late if unmounted before the source resolves", async () => {
    const { unmount } = render(<Mascot />);
    unmount();
    const calls = env.drawImage.mock.calls.length;
    await settle();
    expect(env.drawImage.mock.calls.length).toBe(calls);
    expect(env.pendingFrames()).toBe(0);
  });
});

describe("Mascot with reduced motion", () => {
  beforeEach(() => preferReducedMotion(true));

  it("draws one still frame and requests no animation frames or pointer listeners", async () => {
    render(<Mascot />);
    await settle();
    expect(canvas().dataset.state).toBe("static");
    expect(env.drawImage).toHaveBeenCalled();
    expect(env.pendingFrames()).toBe(0);
    expect(env.liveListeners().map((l) => l.type)).not.toContain("pointermove");

    fireEvent.pointerMove(mascot(), { clientX: 10, clientY: 10 });
    act(() => env.intersections[0]!.trigger(true));
    expect(env.pendingFrames()).toBe(0);
  });

  it("holds the model still near side-on (20°) instead of spinning", async () => {
    render(<Mascot />);
    await settle();
    expect(canvas().dataset.angle).toBe("20");
    const drawn = env.drawImage.mock.calls.length;
    expect(drawn).toBeGreaterThan(0);
    act(() => env.runFrame(1000));
    expect(canvas().dataset.angle).toBe("20");
    expect(env.drawImage.mock.calls.length).toBe(drawn);
  });

  it("still activates on click and keyboard", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Mascot onActivate={onActivate} />);
    await settle();

    await user.click(mascot());
    await user.keyboard("{Enter}");

    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate.mock.calls.map(([a]) => a.input)).toEqual(["pointer", "keyboard"]);
    expect(env.pendingFrames()).toBe(0);
  });
});
