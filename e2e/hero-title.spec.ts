import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { site } from "../src/content/site";

const lastWord = site.name.slice(site.name.lastIndexOf(" ") + 1);
const title = (page: Page) =>
  page.getByTestId("hero-title-bench").getByRole("heading", { level: 2 });
// The name's own overlay sits inside its heading; a page title's overlay is beside its h1.
const overlay = (page: Page) => page.locator(":is(h1, h2) [data-shimmer]");

async function open(page: Page) {
  await page.goto("/lab/title");
  await expect(title(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe("/lab/title", () => {
  // Issue #22 asks for about 60px on phones and about 128px from `md` (768px). Archivo Black is too
  // wide for that on one line in a narrow space, so the name stacks ("Tuan" over "Hoang") where
  // one line won't fit and stays on one line where it does (decided by Tuan, recorded on PR #38).
  // 320px is the narrowest width promised, 375px is the width docs/design-system.md promises.
  for (const { width, fontSize, lines } of [
    { width: 320, fontSize: "60px", lines: 2 },
    { width: 375, fontSize: "60px", lines: 2 },
    { width: 600, fontSize: "60px", lines: 1 },
    { width: 768, fontSize: "128px", lines: 2 },
    { width: 1024, fontSize: "128px", lines: 1 },
    { width: 1280, fontSize: "128px", lines: 1 },
  ]) {
    test(`at ${width}px the name is ${fontSize} on ${lines} line${lines > 1 ? "s" : ""}, unclipped, with no overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      const heading = title(page);
      await expect(heading).toHaveCSS("font-size", fontSize);

      const m = await heading.evaluate((h) => {
        const range = document.createRange();
        range.selectNodeContents(h);
        const text = range.getBoundingClientRect();
        // Count the lines the visible words (not the aria-hidden copy) occupy: one where the name fits,
        // two where it stacks.
        const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
        const tops: number[] = [];
        let visible = "";
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.parentElement!.closest("[data-shimmer]") || !n.textContent!.trim()) continue;
          visible += n.textContent;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const rect of r.getClientRects()) tops.push(Math.round(rect.top));
        }
        const box = h.getBoundingClientRect();
        const shimmer = h.querySelector("[data-shimmer]")!.getBoundingClientRect();
        return {
          text: visible.replace(/\s+/g, " ").trim(),
          lines: new Set(tops).size,
          height: box.height,
          lineHeight: parseFloat(getComputedStyle(h).lineHeight),
          scrollWidth: h.scrollWidth,
          clientWidth: h.clientWidth,
          textLeft: text.left,
          textRight: text.right,
          shimmerRight: shimmer.right,
          boxLeft: box.left,
          boxRight: box.right,
          viewport: document.documentElement.clientWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(m.lines, "wrong number of lines").toBe(lines);
      expect(m.height, "the heading is taller than its lines").toBeLessThanOrEqual(
        Math.ceil(m.lineHeight) * lines,
      );
      expect(m.text, "the visible text changed").toBe(site.name.replace(" ", ""));
      expect(m.scrollWidth, "text overflows its heading").toBeLessThanOrEqual(m.clientWidth);
      expect(m.textLeft).toBeGreaterThanOrEqual(m.boxLeft);
      expect(m.textRight, "text runs past its heading").toBeLessThanOrEqual(m.boxRight);
      expect(m.shimmerRight, "shimmer runs past its heading").toBeLessThanOrEqual(m.boxRight);
      expect(m.textRight, "text runs off screen").toBeLessThanOrEqual(m.viewport);
      expect(m.overflow).toBe(0);
    });
  }

  test("screen readers hear the name once; the shimmer copy is hidden from them", async ({
    page,
  }) => {
    await open(page);
    await expect(title(page)).toHaveAccessibleName(site.name);
    await expect(overlay(page)).toHaveAttribute("aria-hidden", "true");
    await expect(overlay(page)).toHaveText(lastWord);
    await expect(page.getByRole("heading", { name: site.name })).toHaveCount(1);
  });

  test("stacked, the name is still read once as exactly the site name", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await expect(title(page)).toHaveAccessibleName(site.name);
    await expect(title(page)).toHaveText(`${site.name}${lastWord}`);
    await expect(page.getByRole("heading", { name: site.name })).toHaveCount(1);
  });

  test("Hoang shimmers: a gradient clipped to its letters, drifting 7 s each way", async ({
    page,
  }) => {
    await open(page);
    await expect(title(page)).toHaveCSS("font-family", /Archivo Black/);
    await expect(overlay(page)).toHaveCSS("background-clip", "text");
    await expect(overlay(page)).toHaveCSS("color", "rgba(0, 0, 0, 0)");
    await expect(overlay(page)).toHaveCSS("background-image", /^linear-gradient/);

    const timing = await overlay(page).evaluate((el) =>
      el.getAnimations().map((a) => {
        const t = a.effect!.getComputedTiming();
        return { duration: t.duration, direction: t.direction, iterations: t.iterations };
      }),
    );
    expect(timing).toEqual([{ duration: 7000, direction: "alternate", iterations: Infinity }]);

    const before = await overlay(page).evaluate((el) => getComputedStyle(el).backgroundPosition);
    await page.waitForTimeout(500);
    const after = await overlay(page).evaluate((el) => getComputedStyle(el).backgroundPosition);
    expect(after).not.toBe(before);
  });

  test("under reduced motion the shimmer is drawn but static", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await expect(overlay(page)).toHaveCSS("background-clip", "text");
    expect(await overlay(page).evaluate((el) => el.getAnimations().length)).toBe(0);

    const before = await overlay(page).evaluate((el) => getComputedStyle(el).backgroundPosition);
    await page.waitForTimeout(500);
    const after = await overlay(page).evaluate((el) => getComputedStyle(el).backgroundPosition);
    expect(after).toBe(before);
  });

  // axe can't judge this text: it reports color-contrast as "incomplete" because the page's
  // graph-paper background and the shimmer are gradients. So measure every color the letters can
  // take against paper and hold each to WCAG's 3:1 for large text.
  test("every color the name can take has at least 3:1 contrast against paper", async ({
    page,
  }) => {
    await open(page);
    const results = await title(page).evaluate((h) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const rgb = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const luminance = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const paper = luminance(
        rgb(getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim()),
      );
      const ratio = (css: string) => {
        const l = luminance(rgb(css));
        return (Math.max(l, paper) + 0.05) / (Math.min(l, paper) + 0.05);
      };
      const shimmer = getComputedStyle(h.querySelector("[data-shimmer]")!).backgroundImage;
      const stops = shimmer.match(/(rgba?|color)\([^()]*\)/g) ?? [];
      return [getComputedStyle(h).color, ...stops].map((c) => ({
        color: c,
        ratio: Math.round(ratio(c) * 100) / 100,
      }));
    });
    // The base text plus the nine gradient stops.
    expect(results).toHaveLength(10);
    const low = results.filter((r) => r.ratio < 3);
    expect(low, JSON.stringify(results)).toEqual([]);
  });

  test("has no accessibility violations", async ({ page }) => {
    await open(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
  });
});
