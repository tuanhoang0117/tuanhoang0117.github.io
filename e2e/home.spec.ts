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

test("assembles the title, tagline, mascot, banner, and intro", async ({ page }) => {
  await page.goto("/");

  await expect(title(page)).toBeVisible();
  await expect(title(page).locator("[data-shimmer]")).toBeVisible();
  await expect(page.getByText(site.tagline, { exact: true })).toBeVisible();
  await expect(mascot(page)).toBeVisible();
  await expect(page.getByRole("group", { name: mascotLabel })).toHaveAccessibleDescription(
    /Enter or Space/,
  );
  await expect(banner(page)).toContainText(school.name);
  await expect(page.getByText(homeIntro.body, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: homeIntro.workLink })).toHaveAttribute(
    "href",
    "/portfolio",
  );
});

test("clicking or pressing the mascot drops tokens", async ({ page }) => {
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
  const strip = await box(banner(page));
  const hero = [title(page), mascot(page), page.getByText(site.tagline, { exact: true })];

  if (isMobile) {
    expect(strip.y + strip.height).toBeCloseTo(await page.evaluate(() => innerHeight), 0);
  } else {
    expect(strip.x + strip.width).toBeCloseTo(await page.evaluate(() => innerWidth), 0);
  }
  for (const element of hero) expect(overlap(await box(element), strip)).toBe(0);
});

test("reduced motion holds the hero still and disables token physics", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(title(page)).toBeVisible();
  await expect(mascot(page).locator("canvas")).toHaveAttribute("data-state", "static");
  await expect(banner(page)).toHaveAttribute("data-copies", "1");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await mascot(page).click();
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
