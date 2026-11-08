import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { toRuns } from "../src/pixel/runs";
import { sprites } from "../src/pixel/sprites";

const SCALES = [1, 4, 8];

const size = (frame: readonly string[]) => ({
  width: Array.from(frame[0] ?? "").length,
  height: frame.length,
});

const entry = (page: Page, name: string) =>
  page.getByTestId("lab-sprite").filter({ has: page.getByRole("heading", { name, exact: true }) });

test.describe("/lab", () => {
  test("lists every registered sprite with its size, frame count, and rect counts", async ({
    page,
  }) => {
    await page.goto("/lab");
    await expect(page.getByTestId("lab-sprite")).toHaveCount(sprites.length);

    for (const sprite of sprites) {
      const { width, height } = size(sprite.frames[0]!);
      const rects = sprite.frames.map((f) => toRuns(f, sprite.palette).length);
      const section = entry(page, sprite.name);
      await expect(section).toHaveCount(1);
      await expect(section.locator('[data-fact="Size"]')).toHaveText(`${width}×${height}`);
      await expect(section.locator('[data-fact="Frames"]')).toHaveText(
        String(sprite.frames.length),
      );
      await expect(section.locator('[data-fact="Rects per frame"]')).toHaveText(rects.join(" / "));
    }
  });

  test("renders each sprite at scales 1, 4, and 8 as crisp SVG with one rect per run", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // hold frame 0 so rect counts are stable
    await page.goto("/lab");

    for (const sprite of sprites) {
      const { width, height } = size(sprite.frames[0]!);
      const svgs = page.locator("main").locator(`svg[data-sprite="${sprite.name}"]`);
      await expect(svgs).toHaveCount(SCALES.length);

      for (const [i, scale] of SCALES.entries()) {
        const svg = svgs.nth(i);
        await expect(svg).toHaveAccessibleName(`${sprite.name} at ${scale}×`);
        await expect(svg).toHaveAttribute("viewBox", `0 0 ${width} ${height}`);
        await expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
        await expect(svg).toHaveCSS("shape-rendering", "crispedges");
        await expect(svg).toHaveAttribute("data-frame", "0");
        const box = (await svg.boundingBox())!;
        expect(box.width).toBe(width * scale);
        expect(box.height).toBe(height * scale);
        await expect(svg.locator("rect")).toHaveCount(
          toRuns(sprite.frames[0]!, sprite.palette).length,
        );
      }
    }
  });

  test("every rect paints with its palette color, resolved from the design tokens", async ({
    page,
  }) => {
    await page.goto("/lab");
    for (const sprite of sprites) {
      const problems = await page
        .locator("main")
        .locator(`svg[data-sprite="${sprite.name}"]`)
        .first()
        .evaluate((svg) => {
          const resolve = (color: string) => {
            const probe = document.createElement("span");
            probe.style.color = color;
            document.body.append(probe);
            const value = getComputedStyle(probe).color;
            probe.remove();
            return value;
          };
          const out: string[] = [];
          for (const rect of svg.querySelectorAll("rect")) {
            const declared = rect.getAttribute("fill")!;
            const token = /^var\((--[a-z0-9-]+)\)$/.exec(declared)?.[1];
            if (token && !getComputedStyle(document.documentElement).getPropertyValue(token)) {
              out.push(`${declared} is not a defined token`);
            }
            const painted = getComputedStyle(rect).fill;
            if (painted !== resolve(declared)) out.push(`${declared} painted as ${painted}`);
          }
          return out;
        });
      expect(problems, sprite.name).toEqual([]);
    }
  });

  test("multi-frame sprites animate", async ({ page }) => {
    await page.goto("/lab");
    for (const sprite of sprites.filter((s) => s.frames.length > 1)) {
      const svg = page.locator("main").locator(`svg[data-sprite="${sprite.name}"]`).first();
      // Off-screen sprites pause by design, so bring each one into view before waiting on a frame.
      await svg.scrollIntoViewIfNeeded();
      await expect(svg).toHaveAttribute("data-frame", "1", { timeout: 3000 });
    }
  });

  test("under reduced motion, sprites hold frame 0", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab");
    // Three frame intervals of the slowest animated sprite: long enough for any of them to step.
    const rates = sprites.filter((s) => s.frames.length > 1).map((s) => s.fps!);
    const slowest = rates.length > 0 ? Math.min(...rates) : 1;
    await page.waitForTimeout((1000 / slowest) * 3);
    const frames = await page
      .locator("svg[data-sprite]")
      .evaluateAll((svgs) => svgs.map((s) => s.getAttribute("data-frame")));
    expect(frames.length).toBeGreaterThan(0);
    expect(new Set(frames)).toEqual(new Set(["0"]));
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/lab");
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
  });

  test("has no horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/lab");
    await expect(page.locator("main svg[data-sprite]").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
