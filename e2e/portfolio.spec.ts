import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { projects } from "../src/content/projects";

const featured = projects.find((p) => p.featured)!;
// Reading order on the page: the featured project, then the rest in content order.
const ordered = [featured, ...projects.filter((p) => !p.featured)];

const cards = (page: Page) => page.getByRole("main").getByRole("article");
const featuredCard = (page: Page) => page.getByTestId("featured-project");

/**
 * Waits until the card entrances have finished, so layout is measured where the cards rest, not
 * mid-rise. Ignores endless loops (the banner scrolls forever).
 */
async function settleEntrances(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
        ),
      { timeout: 3000 },
    )
    .toBe(0);
}

/** Records every Web Animations call on the page: the card's heading or tag, and the delay. */
async function recordEntrances(page: Page) {
  await page.addInitScript(() => {
    const log: { target: string; delay: number }[] = [];
    (window as unknown as { entranceLog: typeof log }).entranceLog = log;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const timing = typeof options === "object" ? options : {};
      log.push({
        target: this.matches("article") ? this.querySelector("h2")!.textContent! : this.tagName,
        delay: Number(timing.delay ?? 0),
      });
      return original.call(this, keyframes, options);
    };
  });
}

const entranceLog = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { entranceLog: { target: string; delay: number }[] }).entranceLog,
  );

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Each card's box, rounded to whole pixels. */
async function boxes(page: Page) {
  return cards(page).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    }),
  );
}

test.describe("/portfolio", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/portfolio");
  });

  test("shows every project as a card, the featured project first", async ({ page }) => {
    await expect(cards(page)).toHaveCount(projects.length);
    for (const [i, p] of ordered.entries()) {
      await expect(cards(page).nth(i).getByRole("heading", { level: 2 })).toHaveText(p.title);
    }
    await expect(featuredCard(page)).toHaveCount(1);
    await expect(featuredCard(page).getByRole("heading", { level: 2 })).toHaveText(featured.title);
  });

  test("every card is fully visible after load, with no scrolling and nothing left hidden", async ({
    page,
  }) => {
    await expect(cards(page)).toHaveCount(projects.length);
    await settleEntrances(page);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    // Cards below the fold too: nothing waits for a scroll position (ADR 0002).
    for (const card of await cards(page).all()) {
      await expect(card).toBeVisible();
      await expect(card).toHaveCSS("opacity", "1");
      await expect(card).toHaveCSS("clip-path", "none");
      await expect(card).toHaveCSS("transform", "none");
      // Tailwind's translate-* utilities set `translate`, not `transform`.
      await expect(card).toHaveCSS("translate", "none");
      await expect(card).not.toContainText(/undefined|NaN/);
    }
  });

  test("the featured card's case-study link opens the DFG case-study page", async ({ page }) => {
    expect(featured.slug).toBe("tar-syndrome-website");
    const link = featuredCard(page).getByRole("link", { name: /^Case study/ });
    await expect(link).toHaveAttribute("href", "/portfolio/tar-syndrome-website");
    await link.click();
    await expect(page).toHaveURL("/portfolio/tar-syndrome-website");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(featured.title);
  });

  test("the featured card links to the live site in a new tab", async ({ page }) => {
    for (const l of featured.links) {
      const link = featuredCard(page).getByRole("link", { name: new RegExp(`^${l.label}`) });
      await expect(link).toHaveAttribute("href", l.href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noreferrer/);
    }
    const live = featured.links.find((l) => /live site/i.test(l.label));
    expect(live?.href).toMatch(/^https:\/\//);
  });

  test("every other project keeps its links from content", async ({ page }) => {
    for (const [i, p] of ordered.entries()) {
      for (const l of p.links) {
        await expect(
          cards(page)
            .nth(i)
            .getByRole("link", { name: new RegExp(`^${l.label}`) }),
        ).toHaveAttribute("href", l.href);
      }
    }
  });

  test("cards carry accent block shadows that vary across the page, never plain ink", async ({
    page,
  }) => {
    await settleEntrances(page);
    // Tailwind stacks transparent ring layers before the block shadow; the block is the last
    // layer: "<color> 10px 10px 0px 0px", hard (no blur, no spread).
    const blockLayer = (s: string) => s.split(/, (?=(?:rgba?|oklab|oklch)\()/).at(-1)!;
    const shadows = (
      await cards(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).boxShadow))
    ).map(blockLayer);
    // The same size with no accent color: the plain ink shadow a card must not have.
    const inkShadow = blockLayer(
      await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.className = "shadow-block-lg";
        document.body.append(probe);
        const shadow = getComputedStyle(probe).boxShadow;
        probe.remove();
        return shadow;
      }),
    );
    expect(inkShadow).toMatch(/ 10px 10px 0px 0px$/);
    for (const s of shadows) {
      expect(s).toMatch(/ 10px 10px 0px 0px$/);
      expect(s).not.toBe(inkShadow);
    }
    // The Portfolio theme has four shadow colors; seven cards cycle through all of them.
    expect(new Set(shadows).size).toBe(4);
    // Neighbours never share a color.
    for (let i = 1; i < shadows.length; i++) expect(shadows[i]).not.toBe(shadows[i - 1]);
  });

  test("cards enter one after another on load, in reading order", async ({ page }) => {
    await recordEntrances(page);
    await page.goto("/portfolio");
    await expect(cards(page)).toHaveCount(projects.length);
    expect(await page.locator("main [data-stagger] > article").count()).toBe(projects.length);
    const log = await entranceLog(page);
    expect(log.map((a) => a.target)).toEqual(ordered.map((p) => p.title));
    expect(log[0]!.delay).toBe(0);
    for (const [i, a] of log.slice(1).entries()) {
      expect(a.delay - log[i]!.delay).toBeGreaterThanOrEqual(40);
      expect(a.delay - log[i]!.delay).toBeLessThanOrEqual(80);
    }
  });

  test("under reduced motion, cards appear in place with no entrance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordEntrances(page);
    await page.goto("/portfolio");
    await expect(cards(page)).toHaveCount(projects.length);
    expect(await entranceLog(page)).toEqual([]);
    for (const card of await cards(page).all()) {
      await expect(card).toBeVisible();
      await expect(card).toHaveCSS("transform", "none");
      await expect(card).toHaveCSS("translate", "none");
      await expect(card).toHaveCSS("clip-path", "none");
    }
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await expect(cards(page)).toHaveCount(projects.length);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  // 375px is the width docs/design-system.md promises; 800px is a tablet; 1280px is desktop.
  for (const { width, cols } of [
    { width: 375, cols: 1 },
    { width: 800, cols: 2 },
    { width: 1280, cols: 3 },
  ]) {
    test(`lays out ${cols} column(s) at ${width}px, featured card full width, no overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect(cards(page)).toHaveCount(projects.length);
      await settleEntrances(page);
      const [first, ...rest] = await boxes(page);
      expect(new Set(rest.map((b) => b.left)).size).toBe(cols);
      // The featured card spans the grid: from the first column's left to the last's right.
      expect(first!.left).toBe(Math.min(...rest.map((b) => b.left)));
      expect(first!.right).toBe(Math.max(...rest.map((b) => b.right)));
      expect(await overflow(page)).toBe(0);
    });
  }

  test("fills the width at 1280px: every row is full, none orphaned, no wide side margins", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(cards(page)).toHaveCount(projects.length);
    await settleEntrances(page);
    const [first, ...rest] = await boxes(page);
    const rows = new Map<number, number>();
    for (const b of rest) rows.set(b.top, (rows.get(b.top) ?? 0) + 1);
    for (const count of rows.values()) expect(count).toBe(3);
    // The grid spans the page container: it lines up with the page title on the left, and runs
    // at least 80% of the viewport.
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(first!.left).toBe(Math.round(title.x));
    expect(first!.right - first!.left).toBeGreaterThanOrEqual(1280 * 0.8);
  });
});
