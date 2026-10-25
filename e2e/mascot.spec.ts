import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mascotLabel } from "../src/content/mascot";

const mascot = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });
const canvas = (page: Page) => mascot(page).locator("canvas");
const calls = (page: Page) => page.getByTestId("mascot-calls");
const last = (page: Page) => page.getByTestId("mascot-last");

const framesDrawn = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => Number(c.dataset.frames ?? 0));

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
    const center = `${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)}`;
    await page.keyboard.press("Enter");
    await expect(calls(page)).toHaveText("1");
    await page.keyboard.press("Space");
    await expect(calls(page)).toHaveText("2");
    await expect(last(page)).toHaveText(`keyboard @ ${center}`);
  });

  test("activation gives press feedback, then releases", async ({ page }) => {
    // Read the state 120ms after the press: the 75ms scale transition is done and the press
    // (PRESS_MS, 160ms) hasn't ended yet.
    const during = await mascot(page).evaluate(async (b: HTMLButtonElement) => {
      b.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { pressed: b.hasAttribute("data-pressed"), scale: getComputedStyle(b).scale };
    });
    expect(during).toEqual({ pressed: true, scale: "0.95" });
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

  test("clicking and the keyboard still activate", async ({ page }) => {
    await mascot(page).click();
    await expect(calls(page)).toHaveText("1");
    await mascot(page).press("Enter");
    await expect(calls(page)).toHaveText("2");
  });
});
