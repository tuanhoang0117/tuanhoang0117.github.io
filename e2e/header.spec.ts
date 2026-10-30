import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { site } from "../src/content/site";

const homeLink = (page: Page) => page.getByRole("link", { name: site.name, exact: true });
const toggle = (page: Page) =>
  page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /menu$/ });

// Every route with a page title: the home hero, and the pages whose title comes from PageHeader.
const titled = ["/", "/portfolio", "/resume", "/contact", "/lab", "/portfolio/remind-app", "/404"];

/** Waits a frame for transitions to start, then until every menu transition has finished. */
async function settle(page: Page) {
  await page
    .locator("header")
    .first()
    .evaluate(async (el) => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
    });
}

/**
 * Waits a frame for entrances to start, then until every animation on the page that can end has
 * finished. Looping ones (the banner, the title shimmer) never finish, so they are skipped.
 */
async function settlePage(page: Page) {
  await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ending = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(ending.map((a) => a.finished.catch(() => {})));
  });
}

/** The parts of the block style the home link must share with the menu toggle. */
function blockStyle(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      top: r.top,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      background: cs.backgroundColor,
      shadow: cs.boxShadow,
      position: cs.position,
    };
  });
}

test.describe("home link", () => {
  test("pairs with the menu toggle: fixed top left, 44x44, same block style", async ({ page }) => {
    await page.goto("/portfolio");
    const link = await blockStyle(page, "[data-home-link]");
    const menu = await blockStyle(page, 'nav[aria-label="Main"] button');
    expect(link).toEqual({ ...menu, position: "fixed" });
    expect(link.width).toBe(44);
    expect(link.height).toBe(44);

    // Mirrors the toggle: the same gap from the left edge as the toggle has from the right.
    const gaps = await page.evaluate(() => {
      const a = document.querySelector("[data-home-link]")!.getBoundingClientRect();
      const t = document.querySelector('nav[aria-label="Main"] button')!.getBoundingClientRect();
      return { left: a.left, right: document.documentElement.clientWidth - t.right };
    });
    expect(gaps.left).toBe(gaps.right);

    // Still in the corner after scrolling.
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect((await blockStyle(page, "[data-home-link]")).top).toBe(link.top);
  });

  test("shows the mustyIdle sprite pixel-crisp at a whole-number scale", async ({ page }) => {
    await page.goto("/portfolio");
    const sprite = homeLink(page).locator("svg");
    await expect(sprite).toHaveAttribute("data-sprite", "musty-idle");
    await expect(sprite).toHaveAttribute("shape-rendering", "crispEdges");
    await expect(sprite).toHaveAttribute("aria-hidden", "true");
    const size = await sprite.evaluate((el) => {
      const [, , w, h] = el.getAttribute("viewBox")!.split(" ").map(Number);
      const r = el.getBoundingClientRect();
      return { x: r.width / w!, y: r.height / h!, fits: r.width <= 40 && r.height <= 40 };
    });
    expect(Number.isInteger(size.x)).toBe(true);
    expect(size).toEqual({ x: size.x, y: size.x, fits: true });
  });

  test("is on every page", async ({ page }) => {
    for (const path of titled) {
      await page.goto(path);
      await expect(homeLink(page), path).toBeVisible();
    }
  });

  test("is a real link to / that works with a click or tap", async ({ page, isMobile }) => {
    await page.goto("/resume");
    await expect(homeLink(page)).toHaveAttribute("href", "/");
    await expect(homeLink(page)).toHaveAccessibleName(site.name);
    if (isMobile) await homeLink(page).tap();
    else await homeLink(page).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(site.name);
  });

  test("works with Enter and shows a visible focus ring", async ({ page }) => {
    await page.goto("/contact");
    // Skip link first, then the home link, then the menu toggle.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(homeLink(page)).toBeFocused();
    const ring = await homeLink(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("Tab");
    await expect(toggle(page)).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/");
  });

  for (const width of [320, 375, 768, 1280]) {
    test(`at ${width}px it never covers a page title`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of titled) {
        await page.goto(path);
        // Measure the settled layout: the page entrance starts the title lower than where it ends.
        await settlePage(page);
        const overlap = await page.evaluate(() => {
          const a = document.querySelector("[data-home-link]")!.getBoundingClientRect();
          const h = document.querySelector("h1")!.getBoundingClientRect();
          // The block shadow is part of what the link covers (shadow-block-sm: 3px).
          const right = a.right + 3;
          const bottom = a.bottom + 3;
          const w = Math.max(0, Math.min(right, h.right) - Math.max(a.left, h.left));
          const hgt = Math.max(0, Math.min(bottom, h.bottom) - Math.max(a.top, h.top));
          return w * hgt;
        });
        expect(overlap, `${path} at ${width}px`).toBe(0);
      }
    });
  }

  test("sits under the open menu's panel and dim layer", async ({ page, isMobile }) => {
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/portfolio");
      if (isMobile) await toggle(page).tap();
      else await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await settle(page);
      // Whatever is on top at each corner and the center of the link is the menu, not the link.
      const onTop = await page.evaluate(() => {
        const a = document.querySelector("[data-home-link]")!.getBoundingClientRect();
        const points = [
          [a.left + 1, a.top + 1],
          [a.right - 1, a.top + 1],
          [a.left + 1, a.bottom - 1],
          [a.right - 1, a.bottom - 1],
          [a.left + a.width / 2, a.top + a.height / 2],
        ];
        return points.map(([x, y]) => {
          const el = document.elementFromPoint(x!, y!);
          if (el?.closest("[data-home-link]")) return "home link";
          if (el?.closest("[data-menu-backdrop]")) return "dim layer";
          if (el?.closest('nav[aria-label="Main"] [id]')) return "panel";
          return el?.tagName ?? "nothing";
        });
      });
      for (const where of onTop) expect(["dim layer", "panel"], `${width}px`).toContain(where);
    }
  });

  test("Shift+Tab from the open menu's toggle to the home link closes the menu", async ({
    page,
  }) => {
    await page.goto("/portfolio");
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await toggle(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(homeLink(page)).toBeFocused();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  for (const width of [320, 375]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      for (const path of ["/", "/portfolio"]) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBe(0);
      }
    });
  }

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/portfolio");
    const { violations } = await new AxeBuilder({ page }).include("[data-home-link]").analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("animates its idle frames, and holds still under reduced motion", async ({ page }) => {
    const frames = async () => {
      const sprite = homeLink(page).locator("svg");
      const seen = new Set<string | null>();
      for (let i = 0; i < 14; i++) {
        seen.add(await sprite.getAttribute("data-frame"));
        await page.waitForTimeout(100);
      }
      return [...seen].sort();
    };

    await page.goto("/portfolio");
    expect(await frames()).toEqual(["0", "1"]);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/portfolio");
    expect(await frames()).toEqual(["0"]);
  });
});
