import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { school } from "../src/content/site";

type Box = { x: number; y: number; width: number; height: number };

const banner = (page: Page) => page.getByTestId("school-banner");
const hero = (page: Page) => page.getByTestId("banner-lab-hero");

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, "element has a layout box").not.toBeNull();
  return b!;
}

/** Overlapping area of two boxes in px²; 0 when they only touch or are apart. */
function overlap(a: Box, b: Box) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, w) * Math.max(0, h);
}

/** The running loop: distance per iteration (from the keyframes), duration, and copy sizes. */
async function loop(page: Page) {
  return banner(page).evaluate((strip) => {
    const vertical = strip.dataset.orientation === "vertical";
    const along = (el: Element) => {
      const r = el.getBoundingClientRect();
      return vertical ? r.height : r.width;
    };
    const animations = strip.getAnimations({ subtree: true });
    const anim = animations[0];
    const effect = anim?.effect as KeyframeEffect | undefined;
    const end = effect ? String(effect.getKeyframes().at(-1)!.transform) : "";
    const distance = Math.abs(
      Number(/(-?[\d.]+)px/.exec(end.split(",")[vertical ? 1 : 0] ?? "")?.[1] ?? NaN),
    );
    const copies = Array.from(strip.querySelectorAll("[data-banner-copy]"));
    return {
      vertical,
      running: animations.filter((a) => a.playState === "running").length,
      duration: Number(effect?.getTiming().duration ?? 0),
      iterations: effect?.getTiming().iterations,
      distance,
      copy: copies[0] ? along(copies[0]) : 0,
      copies: copies.length,
      strip: along(strip),
    };
  });
}

test.describe("/lab/banner", () => {
  test("stays at the viewport edge above transformed or filtered ancestors", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/lab/banner");
    const view = page.viewportSize()!;
    for (const style of ["transform: translateY(8px)", "filter: blur(0px)"]) {
      await page.evaluate(
        (value) => document.querySelector("#root")?.setAttribute("style", value),
        style,
      );
      const b = await box(banner(page));
      if (isMobile) {
        expect(b.x).toBe(0);
        expect(b.y + b.height).toBe(view.height);
      } else {
        expect(b.x + b.width).toBe(view.width);
        expect(b.y).toBe(0);
        expect(b.height).toBe(view.height);
      }
    }
  });

  test("is a full-height strip on the right at desktop, a full-width strip at the bottom at 375px", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/lab/banner");
    const view = page.viewportSize()!;
    const b = await box(banner(page));
    await expect(banner(page)).toBeVisible();

    if (isMobile) {
      expect(view.width).toBe(375);
      await expect(banner(page)).toHaveAttribute("data-orientation", "horizontal");
      expect(b.x).toBe(0);
      expect(b.width).toBe(view.width);
      expect(b.y + b.height).toBe(view.height);
      expect(b.height).toBeLessThan(80);
    } else {
      await expect(banner(page)).toHaveAttribute("data-orientation", "vertical");
      await expect(banner(page)).toHaveCSS("writing-mode", "vertical-rl");
      expect(b.x + b.width).toBe(view.width);
      expect(b.y).toBe(0);
      expect(b.height).toBe(view.height);
      expect(b.width).toBe(96);
    }
  });

  test("is vertical on the right at tablet width", async ({ page, isMobile }) => {
    test.skip(isMobile, "Tablet width is set on the desktop project");
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/lab/banner");
    await expect(banner(page)).toHaveAttribute("data-orientation", "vertical");
    const b = await box(banner(page));
    expect(b.x + b.width).toBe(768);
    expect(b.height).toBe(1024);
  });

  test("shows the school name in white serif on Poly Green", async ({ page }) => {
    await page.goto("/lab/banner");
    const copy = banner(page).locator("[data-banner-copy]").first();
    await expect(copy).toContainText(school.name);
    const style = await banner(page).evaluate((strip) => {
      const resolve = (color: string) => {
        const probe = document.createElement("span");
        probe.style.color = color;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const text = strip.querySelector("[data-banner-copy] span")!;
      return {
        background: getComputedStyle(strip).backgroundColor,
        poly: resolve("var(--color-poly)"),
        color: getComputedStyle(text).color,
        white: resolve("var(--color-white)"),
        font: getComputedStyle(text).fontFamily,
      };
    });
    expect(style.background).toBe(style.poly);
    expect(style.color).toBe(style.white);
    expect(style.font).toMatch(/serif$/);
    expect(style.font).not.toMatch(/sans-serif$/);
  });

  test("loops seamlessly at a constant 70–100 px/s computed from the measured copy", async ({
    page,
  }) => {
    await page.goto("/lab/banner");
    await expect.poll(async () => (await loop(page)).running).toBe(1);
    const l = await loop(page);
    expect(l.iterations).toBe(Infinity);
    // It slides by exactly one measured copy, so the next copy lands where the first began.
    expect(l.copy).toBeGreaterThan(0);
    expect(l.distance).toBeCloseTo(l.copy, 0);
    const speed = (l.distance / l.duration) * 1000;
    expect(speed).toBeGreaterThanOrEqual(70);
    expect(speed).toBeLessThanOrEqual(100);
    // Enough copies that the strip stays full at the end of the slide.
    expect((l.copies - 1) * l.copy).toBeGreaterThanOrEqual(l.strip);
  });

  test("keeps the same speed when the strip length changes", async ({ page, isMobile }) => {
    test.skip(isMobile, "Resizes the desktop viewport");
    await page.goto("/lab/banner");
    await expect.poll(async () => (await loop(page)).running).toBe(1);
    const tall = await loop(page);
    await page.setViewportSize({ width: 1280, height: 3000 });
    await expect.poll(async () => (await loop(page)).strip).toBe(3000);
    await expect.poll(async () => (await loop(page)).copies).toBeGreaterThan(tall.copies);
    const taller = await loop(page);
    expect(taller.duration).toBeCloseTo(tall.duration, 0);
    expect((taller.copies - 1) * taller.copy).toBeGreaterThanOrEqual(taller.strip);
  });

  test("actually moves", async ({ page }) => {
    await page.goto("/lab/banner");
    const track = banner(page).locator("> div");
    const at = () => track.evaluate((el) => getComputedStyle(el).transform);
    const first = await at();
    await expect.poll(at).not.toBe(first);
  });

  test("never covers the nav or the page", async ({ page, isMobile }) => {
    await page.goto("/lab/banner");
    const b = await box(banner(page));
    const nav = await box(page.getByRole("navigation", { name: "Main" }));
    const header = await box(page.locator("header:has(nav)"));
    const h1 = await box(page.getByRole("heading", { level: 1 }));
    const heroBox = await box(hero(page));
    expect(overlap(b, nav), "nav").toBe(0);
    expect(overlap(b, header), "header bar").toBe(0);
    expect(overlap(b, h1), "h1").toBe(0);
    expect(overlap(b, heroBox), "hero").toBe(0);

    if (!isMobile) {
      // The space is reserved for the whole page: nothing extends under the strip.
      const main = await box(page.locator("main"));
      const footer = await box(page.getByRole("contentinfo"));
      expect(main.x + main.width).toBeLessThanOrEqual(b.x);
      expect(footer.x + footer.width).toBeLessThanOrEqual(b.x);
    } else {
      // At the very bottom the footer ends above the strip.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(banner(page)).toHaveAttribute("data-state", "hidden");
      const footer = await box(page.getByRole("contentinfo"));
      expect(footer.y + footer.height).toBeLessThanOrEqual(b.y);
    }
  });

  test("fades out once you scroll past the hero, and back when you return", async ({ page }) => {
    await page.goto("/lab/banner");
    await expect(banner(page)).toHaveAttribute("data-state", "shown");
    await expect(banner(page)).toHaveCSS("opacity", "1");

    const heroBottom = await hero(page).evaluate(
      (el) => el.getBoundingClientRect().bottom + window.scrollY,
    );
    await page.evaluate((y) => window.scrollTo(0, y + 10), heroBottom);
    await expect(banner(page)).toHaveAttribute("data-state", "hidden");
    await expect(banner(page)).toHaveCSS("opacity", "0");
    await expect(banner(page)).toHaveCSS("pointer-events", "none");
    await expect(banner(page)).toHaveAttribute("aria-hidden", "true");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(banner(page)).toHaveAttribute("data-state", "shown");
    await expect(banner(page)).toHaveCSS("opacity", "1");
  });

  test("stays visible while any of the hero is on screen", async ({ page }) => {
    await page.goto("/lab/banner");
    const heroBottom = await hero(page).evaluate(
      (el) => el.getBoundingClientRect().bottom + window.scrollY,
    );
    await page.evaluate((y) => window.scrollTo(0, y - 20), heroBottom);
    // Give the observer a chance to (wrongly) fire.
    await page.waitForTimeout(300);
    await expect(banner(page)).toHaveAttribute("data-state", "shown");
  });

  test("with reduced motion, shows one static copy", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/banner");
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).locator("[data-banner-copy]")).toHaveCount(1);
    await expect(banner(page).locator("[data-banner-copy]")).toContainText(school.name);
    const l = await loop(page);
    expect(l.running).toBe(0);
    expect(l.duration).toBe(0);
    const track = banner(page).locator("> div");
    const before = await track.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(500);
    expect(await track.evaluate((el) => getComputedStyle(el).transform)).toBe(before);
    expect(before).toBe("none");
  });

  test("screen readers hear the school name once", async ({ page }) => {
    await page.goto("/lab/banner");
    await expect.poll(async () => (await loop(page)).copies).toBeGreaterThan(1);
    const tree = await page.locator("body").ariaSnapshot();
    expect(tree.split(school.name).length - 1).toBe(1);
    await expect(page.getByText(school.name, { exact: true })).toHaveCount(
      (await loop(page)).copies,
    );
  });

  test("has no accessibility violations, shown or faded", async ({ page }) => {
    await page.goto("/lab/banner");
    await expect.poll(async () => (await loop(page)).running).toBe(1);
    const check = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      return violations.map((v) => `${v.impact} ${v.id}: ${v.help}`);
    };
    expect(await check()).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(banner(page)).toHaveAttribute("data-state", "hidden");
    expect(await check()).toEqual([]);
  });

  test("has no horizontal overflow", async ({ page }) => {
    await page.goto("/lab/banner");
    await expect.poll(async () => (await loop(page)).running).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
