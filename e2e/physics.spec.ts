import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { HOLD_DELAY_MS, HOLD_RATE_PER_SECOND } from "../src/components/mascot/physics/pressEmitter";
import { tokenArt, tokenVisual } from "../src/components/mascot/physics/tokenVisual";
import { mascotCounterLabel, mascotLabel } from "../src/content/mascot";

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

/**
 * Timestamps, inside the page, the first press and the last release the page receives. The test
 * waits on Playwright's clock, but a busy browser can take the release late, so the page's own
 * clock is the only true measure of how long the hold lasted.
 */
function recordHold(page: Page, down: "pointerdown" | "keydown", up: "pointerup" | "keyup") {
  return page.addInitScript(
    ({ down, up }) => {
      const hold: { down?: number; up?: number } = {};
      (window as unknown as { __hold: typeof hold }).__hold = hold;
      const counts = (event: Event) =>
        event instanceof KeyboardEvent
          ? event.key === " " && !event.repeat
          : (event as PointerEvent).button === 0;
      // Capture on window, so these run in the same task as the page's own handlers.
      window.addEventListener(
        down,
        (event) => {
          if (counts(event) && hold.down === undefined) hold.down = performance.now();
        },
        true,
      );
      window.addEventListener(
        up,
        (event) => {
          if (counts(event) && hold.down !== undefined) hold.up = performance.now();
        },
        true,
      );
    },
    { down, up },
  );
}

/** Checks the tokens dropped against how long the page saw the hold last. Returns the count. */
async function expectHoldRate(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __hold: { up?: number } }).__hold.up))
    .toBeDefined();
  const { held, count } = await overlay(page).evaluate((el) => {
    const { down, up } = (window as unknown as { __hold: { down: number; up: number } }).__hold;
    return { held: up - down, count: Number((el as HTMLElement).dataset.tokens) };
  });
  // One token for the press; after HOLD_DELAY_MS, one per 1000 / HOLD_RATE_PER_SECOND ms.
  const expectedStream = (HOLD_RATE_PER_SECOND * Math.max(0, held - HOLD_DELAY_MS)) / 1000;
  const info = `${count} tokens for a ${Math.round(held)} ms hold`;
  // Late timers only lower the count, so the floor is loose: half the expected rate.
  expect(count - 1, info).toBeGreaterThanOrEqual(Math.floor(expectedStream / 2));
  // The cap bounds the rate, not the count for an assumed duration: never more than the cap for
  // the real hold, plus the press. Counting the delay as held time leaves room for timer jitter.
  expect(count, info).toBeLessThanOrEqual(1 + (HOLD_RATE_PER_SECOND * held) / 1000);
  return count;
}

test.describe("/lab/physics", () => {
  test("keeps viewport sizing when an ancestor is transformed or filtered", async ({ page }) => {
    await page.goto("/lab/physics");
    for (const style of ["transform: translateY(8px)", "filter: blur(0px)"]) {
      await page.evaluate((value) => {
        document.querySelector("#root")?.setAttribute("style", value);
      }, style);
      const measured = await overlay(page).evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const canvas = el as HTMLCanvasElement;
        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          width: canvas.width,
          height: canvas.height,
          dpr: window.devicePixelRatio,
          viewport: { width: innerWidth, height: innerHeight },
        };
      });
      expect(measured.rect).toEqual({
        x: 0,
        y: 0,
        width: measured.viewport.width,
        height: measured.viewport.height,
      });
      expect(measured.width).toBe(Math.round(measured.viewport.width * measured.dpr));
      expect(measured.height).toBe(Math.round(measured.viewport.height * measured.dpr));
    }
  });

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
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("button", { name: "Open menu" }).click();
    await nav.getByRole("link", { name: "Resume" }).click();
    await expect(page).toHaveURL("/resume");
    await expect(overlay(page)).toHaveCount(0);
  });

  test("holding the mouse drops a steady stream at a capped rate", async ({ page }) => {
    await recordHold(page, "pointerdown", "pointerup");
    await page.goto("/lab/physics");
    const box = (await dropButton(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_DELAY_MS + 1000);
    await page.mouse.up();
    const count = await expectHoldRate(page);
    await page.waitForTimeout(500);
    await expect(overlay(page)).toHaveAttribute("data-tokens", String(count));
  });

  test("holding Space drops a steady stream at the same capped rate", async ({ page }) => {
    await recordHold(page, "keydown", "keyup");
    await page.goto("/lab/physics");
    await dropButton(page).focus();
    await page.keyboard.down(" ");
    await page.waitForTimeout(HOLD_DELAY_MS + 1000);
    await page.keyboard.up(" ");
    await expectHoldRate(page);
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

const mustang = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });
const mustangCanvas = (page: Page) => mustang(page).locator("canvas");
const mustangCounter = (page: Page) =>
  page.getByRole("group", { name: mascotLabel }).locator("[data-mascot-counter]");

type Point = { x: number; y: number };

/** Waits for the entrances to finish, so the mustang is measured where it will stay. */
async function settleEntrances(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
      ),
    )
    .toBe(0);
}

/**
 * Loads the home page with the mustang settled and focused, and returns its center. Focusing can
 * scroll it into view, so it comes before measuring.
 */
async function homeMustang(page: Page): Promise<Point> {
  await page.goto("/");
  await expect(mustangCanvas(page)).toHaveAttribute("data-state", "running");
  await mustang(page).focus();
  await settleEntrances(page);
  const box = (await mustang(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * From the moment the first token is drawn (the press draws it at once, before it moves), the
 * center of the overlay's paint on that frame and the next 30, in CSS px.
 */
function trackFirstToken(page: Page) {
  return overlay(page).evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const samples: Point[] = [];
    (window as unknown as { __token: Point[] }).__token = samples;
    const record = () => {
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const scale = canvas.width / canvas.clientWidth;
      let [sumX, sumY, n] = [0, 0, 0];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] === 0) continue;
          sumX += x;
          sumY += y;
          n++;
        }
      }
      if (n > 0) samples.push({ x: sumX / n / scale, y: sumY / n / scale });
    };
    const observer = new MutationObserver(() => {
      if (canvas.dataset.tokens !== "1") return;
      observer.disconnect();
      record();
      const next = () => {
        record();
        if (samples.length < 31) requestAnimationFrame(next);
      };
      requestAnimationFrame(next);
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-tokens"] });
  });
}

async function trackedToken(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __token: Point[] }).__token.length))
    .toBeGreaterThanOrEqual(31);
  return page.evaluate(() => (window as unknown as { __token: Point[] }).__token);
}

/** Every value `data-spin` takes on the mustang's canvas, timed on the page's clock from now. */
function recordSpin(page: Page) {
  return mustangCanvas(page).evaluate((c: HTMLCanvasElement) => {
    const start = performance.now();
    const log = [{ ms: 0, spin: Number(c.dataset.spin) }];
    (window as unknown as { __spin: typeof log }).__spin = log;
    new MutationObserver(() =>
      log.push({ ms: performance.now() - start, spin: Number(c.dataset.spin) }),
    ).observe(c, { attributes: true, attributeFilter: ["data-spin"] });
  });
}

const spinLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spin: { ms: number; spin: number }[] }).__spin);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Presses the mustang once: a real click at `at` (its center by default), or Enter or Space on the
 * focused mustang.
 */
async function pressMustang(page: Page, input: "click" | "Enter" | "Space", at?: Point) {
  if (input !== "click") {
    await expect(mustang(page)).toBeFocused();
    return page.keyboard.press(input === "Enter" ? "Enter" : " ");
  }
  const box = (await mustang(page).boundingBox())!;
  const point = at ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return page.mouse.click(point.x, point.y);
}

test.describe("pressing the home page's mustang", () => {
  test.skip(({ isMobile }) => isMobile, "The home page mounts the mustang only at xl and above");

  for (const input of ["click", "Enter", "Space"] as const) {
    test(`${input} flings a token out of the head's center`, async ({ page }) => {
      // Every random draw is 0.5, so the fling is fixed: half a turn from +x, straight left.
      // A drop would toss it neither left nor right (-3 + 6 × 0.5 = 0).
      await page.addInitScript(() => {
        Math.random = () => 0.5;
      });
      const center = await homeMustang(page);
      await trackFirstToken(page);
      const box = (await mustang(page).boundingBox())!;
      // Off-center, so a token dropped at the pointer would start far from the head's center.
      const pointer = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.2 };
      expect(distance(pointer, center)).toBeGreaterThan(100);
      await pressMustang(page, input, pointer);

      const path = await trackedToken(page);
      expect(distance(path[0]!, center), "drawn first at the head's center").toBeLessThan(3);
      // It flies out along an arc: away from the center on every frame, mostly sideways at first.
      for (let i = 1; i < path.length; i++) {
        expect(
          distance(path[i]!, center),
          `frame ${i}: ${JSON.stringify(path[i])}`,
        ).toBeGreaterThanOrEqual(distance(path[i - 1]!, center) - 0.5);
      }
      const last = path.at(-1)!;
      expect(center.x - last.x, "carried well to the left").toBeGreaterThan(60);
      expect(center.x - last.x, "further across than down").toBeGreaterThan(last.y - center.y);
      await expect(overlay(page)).toHaveAttribute("data-tokens", "1");
    });
  }

  for (const input of ["click", "Enter", "Space"] as const) {
    test(`${input} spins it about 4× faster, easing back to idle within 2 s`, async ({ page }) => {
      await homeMustang(page);
      await expect(mustangCanvas(page)).toHaveAttribute("data-spin", "1.0");
      await recordSpin(page);
      await pressMustang(page, input);
      await expect(mustangCanvas(page)).toHaveAttribute("data-spin", "1.0", { timeout: 4000 });

      const boosted = (await spinLog(page)).slice(1);
      expect(boosted[0]!.spin, "a press boosts it at once").toBe(4);
      for (let i = 1; i < boosted.length; i++) {
        expect(boosted[i]!.spin, `step ${i}`).toBeLessThanOrEqual(boosted[i - 1]!.spin);
      }
      const back = boosted.at(-1)!.ms - boosted[0]!.ms;
      expect(back, "eased back to idle in 1 to 2 s").toBeGreaterThan(1000);
      // A little over 2 s for a busy runner's late frames.
      expect(back).toBeLessThan(2250);
      // Eased, not stepped: it passed through the speeds in between.
      expect(boosted.filter(({ spin }) => spin > 1 && spin < 4).length).toBeGreaterThan(10);
    });
  }

  test("rapid clicks stack up to 8× idle, and it keeps a steady frame rate", async ({ page }) => {
    const center = await homeMustang(page);
    await recordSpin(page);
    for (let i = 0; i < 6; i++) await page.mouse.click(center.x, center.y);
    const perSecond = await mustangCanvas(page).evaluate(async (c: HTMLCanvasElement) => {
      const frames0 = Number(c.dataset.frames ?? 0);
      const t0 = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return ((Number(c.dataset.frames ?? 0) - frames0) * 1000) / (performance.now() - t0);
    });
    await expect(mustangCanvas(page)).toHaveAttribute("data-spin", "1.0", { timeout: 4000 });

    const speeds = (await spinLog(page)).map(({ spin }) => spin);
    expect(Math.max(...speeds), "stacked to the cap, and no further").toBe(8);
    // The same budget as the idle spin's frame-rate tests: 20 frames a second on a busy runner.
    expect(perSecond).toBeGreaterThanOrEqual(20);
    // Flinging changes only where a token starts: every press still counts, and every token still
    // lands and comes to rest. (The e2e build's counter service is unreachable, so it counts here.)
    await expect(mustangCounter(page)).toHaveText(`${mascotCounterLabel}: 6`);
    await expect(overlay(page)).toHaveAttribute("data-tokens", "6");
    await expect(overlay(page)).toHaveAttribute("data-resting", "true", { timeout: REST_TIMEOUT });
  });

  test("under reduced motion, presses don't speed it up and drop no tokens", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(mustangCanvas(page)).toHaveAttribute("data-state", "static");
    await mustang(page).focus();
    for (const input of ["click", "Enter", "Space"] as const) await pressMustang(page, input);
    await page.waitForTimeout(300);
    await expect(mustangCanvas(page)).toHaveAttribute("data-spin", "1.0");
    await expect(mustangCanvas(page)).toHaveAttribute("data-angle", "20");
    await expect(overlay(page)).toHaveCount(0);
  });
});
