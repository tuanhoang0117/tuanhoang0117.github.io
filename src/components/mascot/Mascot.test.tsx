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
