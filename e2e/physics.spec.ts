import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { HOLD_DELAY_MS, HOLD_RATE_PER_SECOND } from "../src/components/mascot/physics/pressEmitter";
import { tokenArt, tokenVisual } from "../src/components/mascot/physics/tokenVisual";

const TOKEN = tokenArt(tokenVisual).radius * 2; // CSS px
const REST_TIMEOUT = 20_000;

const overlay = (page: Page) => page.getByTestId("physics-overlay");
const dropButton = (page: Page) => page.getByRole("button", { name: "Drop token" });

/** Where the canvas has painted pixels, in CSS px, and whether any pixel is half-transparent. */
function paint(page: Page) {
  return overlay(page).evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / canvas.clientWidth;
    let minY = Infinity;
    let maxY = -Infinity;
    let painted = 0;
    let partial = 0;
    let hash = 0;
    let sample: { x: number; y: number } | undefined;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3]!;
        if (a === 0) continue;
        painted++;
        if (a !== 255) partial++;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        hash = (hash * 31 + y * width + x) | 0;
        sample ??= { x: x / scale, y: y / scale };
      }
    }
    return {
      painted,
      partial,
      hash,
      sample,
      top: minY / scale,
      bottom: (maxY + 1) / scale,
      viewport: canvas.clientHeight,
      bufferWidth: canvas.width,
      cssWidth: canvas.clientWidth,
      dpr: window.devicePixelRatio,
    };
  });
}

async function dropAndSettle(page: Page, clicks: number) {
  for (let i = 0; i < clicks; i++) {
    await dropButton(page).click();
  }
  await expect(overlay(page)).toHaveAttribute("data-tokens", String(clicks));
  await expect(overlay(page)).toHaveAttribute("data-resting", "true", { timeout: REST_TIMEOUT });
}

test.describe("/lab/physics", () => {
  test("clicking drops tokens that come to rest at the bottom of the viewport", async ({
    page,
  }) => {
    await page.goto("/lab/physics");
    await dropAndSettle(page, 4);

    const first = await paint(page);
    expect(first.painted).toBeGreaterThan(0);
    // They sit on the floor: the lowest pixel touches the viewport's bottom edge, and four tokens
    // pile no more than three high.
    expect(first.bottom).toBeGreaterThanOrEqual(first.viewport - 2);
    expect(first.top).toBeGreaterThanOrEqual(first.viewport - TOKEN * 3);
    // And they stay put.
    await page.waitForTimeout(500);
    expect((await paint(page)).hash).toBe(first.hash);
  });

  test("tokens are drawn pixel-crisp, with no smoothed edges", async ({ page }) => {
    await page.goto("/lab/physics");
    await dropAndSettle(page, 3);
    const { painted, partial, bufferWidth, cssWidth, dpr } = await paint(page);
    expect(painted).toBeGreaterThan(0);
    expect(partial).toBe(0);
    expect(bufferWidth).toBe(Math.round(cssWidth * dpr));
  });

  test("the overlay never blocks clicks on the page under it", async ({ page }) => {
    await page.goto("/lab/physics");
    await dropAndSettle(page, 3);

    // The canvas covers the whole viewport, yet hit-testing ignores it, even on a token.
    const box = (await overlay(page).boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    const { sample } = await paint(page);
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      sample!,
    );
    expect(hit).not.toBe("CANVAS");

    // The button under it still works, and so does a nav link.
    await dropButton(page).click();
    await expect(overlay(page)).toHaveAttribute("data-tokens", "4");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Resume" })
      .click();
    await expect(page).toHaveURL("/resume");
    await expect(overlay(page)).toHaveCount(0);
  });

  test("holding the mouse drops a steady stream at a capped rate", async ({ page }) => {
    await page.goto("/lab/physics");
    const box = (await dropButton(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_DELAY_MS + 1000);
    await page.mouse.up();
    const count = Number(await overlay(page).getAttribute("data-tokens"));
    // One for the press, then about HOLD_RATE_PER_SECOND for each second held. Timers in a busy
    // browser run late, never early, so the cap is a hard upper bound.
    expect(count).toBeGreaterThanOrEqual(HOLD_RATE_PER_SECOND / 2);
    expect(count).toBeLessThanOrEqual(1 + HOLD_RATE_PER_SECOND);
    await page.waitForTimeout(500);
    await expect(overlay(page)).toHaveAttribute("data-tokens", String(count));
  });

  test("holding Space drops a steady stream at the same capped rate", async ({ page }) => {
    await page.goto("/lab/physics");
    await dropButton(page).focus();
    await page.keyboard.down(" ");
    await page.waitForTimeout(HOLD_DELAY_MS + 1000);
    await page.keyboard.up(" ");
    const count = Number(await overlay(page).getAttribute("data-tokens"));
    expect(count).toBeGreaterThanOrEqual(HOLD_RATE_PER_SECOND / 2);
    expect(count).toBeLessThanOrEqual(1 + HOLD_RATE_PER_SECOND);
  });

  test("the floor moves with the viewport when it resizes", async ({ page }) => {
    await page.goto("/lab/physics");
    await dropAndSettle(page, 3);
    const { width, height } = page.viewportSize()!;

    for (const next of [
      { width, height: height - 200 },
      { width: height - 200, height: width }, // rotate
    ]) {
      await page.setViewportSize(next);
      await expect
        .poll(() =>
          overlay(page).evaluate((el, { width, height }) => {
            const canvas = el as HTMLCanvasElement;
            return (
              canvas.width === Math.round(width * devicePixelRatio) &&
              canvas.height === Math.round(height * devicePixelRatio)
            );
          }, next),
        )
        .toBe(true);
      await expect(overlay(page)).toHaveAttribute("data-resting", "true", {
        timeout: REST_TIMEOUT,
      });
      const after = await paint(page);
      expect(after.viewport).toBe(next.height);
      expect(after.bufferWidth).toBe(Math.round(next.width * after.dpr));
      expect(after.bottom).toBeGreaterThanOrEqual(next.height - 2);
      // Plus one: the buffer's last row, mapped back to CSS px at a fractional ratio.
      expect(after.bottom).toBeLessThanOrEqual(next.height + 1);
      expect(after.top).toBeGreaterThanOrEqual(next.height - TOKEN * 3);
    }
    await expect(overlay(page)).toHaveAttribute("data-tokens", "3");
  });

  test("under reduced motion, no tokens fall", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/physics");
    await dropButton(page).click();
    await page.waitForTimeout(300);
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("has no accessibility violations with tokens on screen", async ({ page }) => {
    await page.goto("/lab/physics");
    await dropAndSettle(page, 3);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
  });

  test("has no horizontal overflow at 375px with tokens on screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/lab/physics");
    await dropAndSettle(page, 3);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
