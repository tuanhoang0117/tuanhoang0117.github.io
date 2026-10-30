import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mascotLabel } from "../src/content/mascot";

const mascot = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });
const canvas = (page: Page) => mascot(page).locator("canvas");
const calls = (page: Page) => page.getByTestId("mascot-calls");
const last = (page: Page) => page.getByTestId("mascot-last");

const framesDrawn = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => Number(c.dataset.frames ?? 0));

/** The model's current angle in degrees, and the painted silhouette's horizontal extent. */
const spinState = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => {
    const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let [left, right] = [c.width, -1];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3]! === 0) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    return { angle: Number(c.dataset.angle), left, right };
  });

/** Degrees turned from `a` to `b`, forward, 0–359. */
const turnedBy = (a: number, b: number) => (((b - a) % 360) + 360) % 360;

test.describe("/lab/mascot", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/lab/mascot");
  });

  test("the canvas renders glyphs, sharp at the device pixel ratio", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    const info = await canvas(page).evaluate((c: HTMLCanvasElement) => {
      const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted++;
      // The renderer's rule: devices with < 4 GB or < 4 cores cap the ratio at 1.5, others at 3.
      const nav = navigator as Navigator & { deviceMemory?: number };
      const low = (nav.deviceMemory ?? 8) < 4 || navigator.hardwareConcurrency < 4;
      return {
        painted: painted / (c.width * c.height),
        width: c.width,
        height: c.height,
        cssWidth: c.getBoundingClientRect().width,
        cssHeight: c.getBoundingClientRect().height,
        dpr: Number(c.dataset.dpr),
        expectedDpr: Math.min(window.devicePixelRatio, low ? 1.5 : 3),
        rendering: getComputedStyle(c).imageRendering,
      };
    });
    // A sphere's worth of glyphs: a real share of the canvas, but not a filled square.
    expect(info.painted).toBeGreaterThan(0.05);
    expect(info.painted).toBeLessThan(0.6);
    expect(info.dpr).toBe(info.expectedDpr);
    expect(info.width).toBe(Math.round(info.cssWidth * info.dpr));
    expect(info.height).toBe(Math.round(info.cssHeight * info.dpr));
    expect(info.rendering).toBe("pixelated");
  });

  test("animates at a steady rate", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    const start = await framesDrawn(page);
    await page.waitForTimeout(1000);
    const perSecond = (await framesDrawn(page)) - start;
    // 30 fps on low-power devices, 60 elsewhere. 20 leaves room for a busy CI runner while still
    // catching a loop that stalls or stops.
    expect(perSecond).toBeGreaterThanOrEqual(20);
  });

  test("the model spins, and the drawn silhouette turns with it", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    const before = await spinState(page);
    await page.waitForTimeout(1500);
    const after = await spinState(page);
    // The slowest point of the turn is about 9° a second, so 1.5 s always moves it.
    expect(turnedBy(before.angle, after.angle)).toBeGreaterThan(5);
    // The glyphs on the canvas follow the model: its outline moved, not just a number.
    expect([after.left, after.right]).not.toEqual([before.left, before.right]);
  });

  test("the spin lingers near the profiles and hurries through edge-on", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    // Sampled inside the page every 100 ms for 7 s. The spin starts at 20° and reaches 90°
    // (edge-on) and 180° (the other profile) within the first 6 s of a 12 s turn.
    const steps = await canvas(page).evaluate(async (c: HTMLCanvasElement) => {
      const out: { from: number; turned: number; seconds: number }[] = [];
      let angle = Number(c.dataset.angle);
      let time = performance.now();
      for (let i = 0; i < 70; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const next = Number(c.dataset.angle);
        const now = performance.now();
        out.push({ from: angle, turned: (next - angle + 360) % 360, seconds: (now - time) / 1000 });
        angle = next;
        time = now;
      }
      return out;
    });
    // Always forward: a step backwards would read as nearly a whole turn.
    for (const { turned } of steps) expect(turned).toBeLessThan(180);
    // Degrees a second near a profile (0°/180°) and near edge-on (90°/270°).
    const offProfile = (a: number) => Math.min(a % 180, 180 - (a % 180));
    const rate = (keep: (a: number) => boolean) => {
      const picked = steps.filter(({ from }) => keep(from));
      expect(picked.length, "the samples should cover this part of the turn").toBeGreaterThan(0);
      const degrees = picked.reduce((sum, { turned }) => sum + turned, 0);
      return degrees / picked.reduce((sum, { seconds }) => sum + seconds, 0);
    };
    const nearProfile = rate((a) => offProfile(a) <= 20);
    const nearEdge = rate((a) => offProfile(a) >= 70);
    expect(nearProfile).toBeGreaterThan(0);
    expect(nearProfile * 3).toBeLessThan(nearEdge);
  });

  test("a click fires onActivate at the pointer", async ({ page }) => {
    const box = (await mascot(page).boundingBox())!;
    const x = Math.round(box.x + box.width * 0.3);
    const y = Math.round(box.y + box.height * 0.6);
    await page.mouse.click(x, y);
    await expect(calls(page)).toHaveText("1");
    await expect(last(page)).toHaveText(`pointer @ ${x}, ${y}`);
  });

  test("Enter and Space each fire onActivate once, from the center", async ({ page }) => {
    await mascot(page).focus();
    const box = (await mascot(page).boundingBox())!;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.keyboard.press("Enter");
    await expect(calls(page)).toHaveText("1");
    await page.keyboard.press("Space");
    await expect(calls(page)).toHaveText("2");
    // The page prints the center rounded from its own measurement, which can land half a pixel
    // from ours (at 375px the center is 187.5), so allow 1px instead of an exact string.
    const printed = (await last(page).innerText()).match(/^keyboard @ (-?\d+), (-?\d+)$/);
    expect(printed, "the readout should show a keyboard activation").not.toBeNull();
    expect(Math.abs(Number(printed![1]) - centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(printed![2]) - centerY)).toBeLessThanOrEqual(1);
  });

  test("activation gives press feedback, then releases", async ({ page }) => {
    // Read the state 120ms after the press: the press (PRESS_MS, 160ms) hasn't ended yet, and the
    // 75ms scale transition is done or nearly so. A busy CI runner can still be a hair short of
    // 0.95 (it read 0.950354), so compare the number with a tolerance instead of the exact string.
    const during = await mascot(page).evaluate(async (b: HTMLButtonElement) => {
      b.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { pressed: b.hasAttribute("data-pressed"), scale: getComputedStyle(b).scale };
    });
    expect(during.pressed).toBe(true);
    expect(Math.abs(Number(during.scale) - 0.95)).toBeLessThan(0.01);
    await expect(mascot(page)).not.toHaveAttribute("data-pressed");
    await expect.poll(() => mascot(page).evaluate((b) => getComputedStyle(b).scale)).toBe("none");
  });

  test("pointer movement and clicks never move the page or the mascot's box", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    const before = await mascot(page).boundingBox();
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY]);
    const box = before!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 20 });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // After the press has released (PRESS_MS) and its transition has finished.
    await page.waitForTimeout(400);
    expect(await mascot(page).boundingBox()).toEqual(before);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(scroll);
    // The readout below the mascot stays reachable: nothing the mascot draws covers it.
    await calls(page).scrollIntoViewIfNeeded();
    const readout = (await calls(page).boundingBox())!;
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute("data-testid"),
      [readout.x + readout.width / 2, readout.y + readout.height / 2],
    );
    expect(hit).toBe("mascot-calls");
  });

  test("pauses while off-screen and resumes when scrolled back", async ({ page }) => {
    // Short enough that the footer and the mascot are never on screen together.
    await page.setViewportSize({ width: 375, height: 240 });
    await mascot(page).scrollIntoViewIfNeeded();
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    await expect(canvas(page)).toHaveAttribute("data-state", "paused");
    const paused = await framesDrawn(page);
    await page.waitForTimeout(300);
    expect(await framesDrawn(page)).toBe(paused);

    await mascot(page).scrollIntoViewIfNeeded();
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    await expect.poll(() => framesDrawn(page)).toBeGreaterThan(paused);
  });

  test("has no accessibility violations", async ({ page }) => {
    // Waits on the canvas, not the named button, so a missing name reaches axe as a violation.
    await expect(page.locator("canvas")).toHaveAttribute("data-state", "running");
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
  });

  test("has no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe("/lab/mascot on a 2× display", () => {
  test.use({ deviceScaleFactor: 2 });

  test("the backing store is twice the CSS size, so glyphs aren't upscaled", async ({ page }) => {
    await page.goto("/lab/mascot");
    await expect(canvas(page)).toHaveAttribute("data-state", "running");
    const { width, cssWidth, dpr } = await canvas(page).evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      cssWidth: c.getBoundingClientRect().width,
      dpr: Number(c.dataset.dpr),
    }));
    expect(dpr).toBeGreaterThanOrEqual(1.5);
    expect(width).toBe(Math.round(cssWidth * dpr));
  });
});

test.describe("/lab/mascot with reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/mascot");
  });

  test("shows a still frame that never redraws", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "static");
    const painted = await canvas(page).evaluate((c: HTMLCanvasElement) => {
      const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(0);
    // Let any one-off redraws (resize, font load) settle, then expect nothing more.
    await page.waitForTimeout(300);
    const settled = await framesDrawn(page);
    const box = (await mascot(page).boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 10 });
    await page.waitForTimeout(500);
    expect(await framesDrawn(page)).toBe(settled);
  });

  test("holds the model still near side-on, at 20°", async ({ page }) => {
    await expect(canvas(page)).toHaveAttribute("data-state", "static");
    const first = await spinState(page);
    expect(first.angle).toBe(20);
    expect(first.right).toBeGreaterThan(first.left);
    await page.waitForTimeout(1000);
    expect(await spinState(page)).toEqual(first);
  });

  test("clicking and the keyboard still activate", async ({ page }) => {
    await mascot(page).click();
    await expect(calls(page)).toHaveText("1");
    await mascot(page).press("Enter");
    await expect(calls(page)).toHaveText("2");
  });
});

test.describe("the spinning mascot on the home page", () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ] as const) {
    test(`at ${width}px it spins at a steady rate, without overflow or axe violations`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "The home page mounts the mascot only at xl and above");
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(canvas(page)).toHaveAttribute("data-state", "running");

      // Frames per second, timed inside the page. Timing from the test side would stretch the
      // window by however long each round trip waits for a busy main thread, so a slow frame
      // could still count 20 frames.
      const { perSecond, turned } = await canvas(page).evaluate(async (c: HTMLCanvasElement) => {
        const read = () => [Number(c.dataset.frames ?? 0), Number(c.dataset.angle)] as const;
        const [frames0, angle0] = read();
        const t0 = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const [frames1, angle1] = read();
        return {
          perSecond: ((frames1 - frames0) * 1000) / (performance.now() - t0),
          turned: (((angle1 - angle0) % 360) + 360) % 360,
        };
      });
      // The same budget as the lab's frame-rate test: 20 frames a second on a busy runner.
      expect(perSecond).toBeGreaterThanOrEqual(20);
      // Spinning: even the slowest point of the turn, about 9° a second, moves this far.
      expect(turned).toBeGreaterThan(5);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
