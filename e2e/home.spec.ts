import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mascotLabel } from "../src/content/mascot";
import { homeIntro, school, site } from "../src/content/site";

type Box = { x: number; y: number; width: number; height: number };

const title = (page: Page) => page.getByRole("heading", { level: 1, name: site.name, exact: true });
const mascot = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });
const banner = (page: Page) => page.getByTestId("school-banner");
const overlay = (page: Page) => page.getByTestId("physics-overlay");

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  expect(value, "element has a layout box").not.toBeNull();
  return value!;
}

function overlap(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

test("assembles the title, tagline, responsive mascot, banner, and intro", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");

  await expect(title(page)).toBeVisible();
  await expect(title(page).locator("[data-shimmer]")).toBeVisible();
  await expect(page.getByText(site.tagline, { exact: true })).toBeVisible();
  if (isMobile) {
    await expect(mascot(page)).toHaveCount(0);
  } else {
    await expect(mascot(page)).toBeVisible();
    await expect(page.getByRole("group", { name: mascotLabel })).toHaveAccessibleDescription(
      /Enter or Space/,
    );
  }
  await expect(banner(page)).toContainText(school.name);
  await expect(page.getByText(homeIntro.body, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: homeIntro.workLink })).toHaveAttribute(
    "href",
    "/portfolio",
  );
});

test("clicking or pressing the mascot drops tokens", async ({ page, isMobile }) => {
  test.skip(isMobile, "The current mascot brief mounts it only at xl and above");
  await page.goto("/");

  await mascot(page).click();
  await expect(overlay(page)).toHaveAttribute("data-tokens", "1");
  await mascot(page).press("Enter");
  await expect(overlay(page)).toHaveAttribute("data-tokens", "2");
  await mascot(page).press("Space");
  await expect(overlay(page)).toHaveAttribute("data-tokens", "3");
});

test("the fixed banner stays on its edge without covering the hero", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(banner(page)).toHaveAttribute("data-state", "shown");
  const strip = await box(banner(page));
  const hero = [title(page), page.getByText(site.tagline, { exact: true })];
  if (!isMobile) hero.push(mascot(page));

  if (isMobile) {
    expect(strip.y + strip.height).toBeCloseTo(await page.evaluate(() => innerHeight), 0);
  } else {
    expect(strip.x + strip.width).toBeCloseTo(await page.evaluate(() => innerWidth), 0);
  }
  for (const element of hero) expect(overlap(await box(element), strip)).toBe(0);
});

/** Visible content in main that the banner's box overlaps, as short HTML snippets. */
async function coveredByBanner(page: Page) {
  return banner(page).evaluate((strip) => {
    const b = strip.getBoundingClientRect();
    return Array.from(document.querySelectorAll("main :is(img, a, button, h1, h2, p, canvas)"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || style.visibility === "hidden") return false;
        const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        return w > 0 && h > 0;
      })
      .map((el) => el.outerHTML.slice(0, 80));
  });
}

async function expectShownAndClear(page: Page) {
  await expect(banner(page)).toHaveCSS("opacity", "1");
  await expect(banner(page)).toHaveCSS("visibility", "visible");
  expect(await coveredByBanner(page)).toEqual([]);
}

for (const width of [320, 375, 390, 430, 768]) {
  test(`at ${width}px wide the banner shows on load at every height, covering nothing`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Phone and tablet coverage runs in the mobile project");
    for (const height of [640, 740, 812, 844, 932]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(banner(page)).toHaveAttribute(
        "data-orientation",
        width < 768 ? "horizontal" : "vertical",
      );
      await expectShownAndClear(page);
    }
  });
}

// Phones tall enough that the page below the hero is shorter than the screen (430x932) can't
// scroll the hero past, so the strip stays to the end there, where body padding keeps it clear.
for (const [width, height] of [
  [320, 640],
  [375, 812],
  [390, 844],
]) {
  test(`at ${width}x${height} the banner fades once the hero scrolls past, and returns`, async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Phone coverage runs in the mobile project");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expectShownAndClear(page);

    const heroBottom = await page
      .locator("main section")
      .first()
      .evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y + 10), heroBottom);
    await expect(banner(page)).toHaveCSS("opacity", "0");
    await expect(banner(page)).toHaveCSS("pointer-events", "none");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expectShownAndClear(page);
    await expect(banner(page)).toHaveCSS("pointer-events", "auto");
  });
}

for (const width of [768, 1024, 1279, 1280, 1440]) {
  test(`at ${width}px the banner is the right rail and covers nothing`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Tablet and desktop coverage runs in the desktop project");
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(banner(page)).toHaveAttribute("data-orientation", "vertical");
    const strip = await box(banner(page));
    expect(strip.x + strip.width).toBeCloseTo(width, 0);
    await expectShownAndClear(page);
    if (width >= 1280) {
      const group = await box(page.getByRole("group", { name: mascotLabel }));
      expect(overlap(group, strip), "mustang group").toBe(0);
    }
  });
}

test("with reduced motion the banner marquee doesn't run", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(banner(page)).toHaveCSS("opacity", "1");
  await page.waitForTimeout(300);
  expect(await banner(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
});

test("the mascot sits directly on the graph paper without a card frame", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const frame = page.getByRole("group", { name: mascotLabel });
  await expect(frame).toHaveCSS("border-top-width", "0px");
  await expect(frame).toHaveCSS("box-shadow", "none");
  await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(frame).toHaveCSS("padding-top", "0px");
});

test("mounts the mascot only at the xl breakpoint", async ({ page, isMobile }) => {
  test.skip(isMobile, "Breakpoint coverage runs in the desktop project");
  await page.setViewportSize({ width: 1279, height: 800 });
  await page.goto("/");
  await expect(page.locator(`button[aria-label="${mascotLabel}"]`)).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(mascot(page)).toBeVisible();
});

test("reduced motion holds the hero still and disables token physics", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(title(page)).toBeVisible();
  await expect(banner(page)).toHaveAttribute("data-copies", "1");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  if (isMobile) {
    await expect(mascot(page)).toHaveCount(0);
  } else {
    await expect(mascot(page).locator("canvas")).toHaveAttribute("data-state", "static");
    await mascot(page).click();
  }
  await expect(overlay(page)).toHaveCount(0);
  // The press feedback is a CSS transition cut to 0.01ms by the reduced-motion rule. It can still
  // be running for a moment right after the click, so wait for it to end; nothing may loop.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 })
    .toBe(0);
});

test("has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

for (const width of [320, 375]) {
  test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
}
