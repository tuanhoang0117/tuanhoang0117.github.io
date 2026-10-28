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

/** Waits for the card entrances to finish, so layout is measured at rest, not mid-rise. */
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

function overlap(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

test("assembles the title, tagline, responsive mascot, and intro", async ({ page, isMobile }) => {
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

test("no school banner is on the page, and the body reserves no space for one", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 640],
    [375, 812],
    [768, 1024],
    [1279, 800],
    [1280, 800],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(title(page)).toBeVisible();
    await expect(banner(page), `${width}px`).toHaveCount(0);
    await expect(page.getByRole("region", { name: school.shortName }), `${width}px`).toHaveCount(0);
    await expect(page.getByText(school.name, { exact: true }), `${width}px`).toHaveCount(0);
    const body = page.locator("body");
    for (const side of ["top", "right", "bottom", "left"]) {
      await expect(body, `${width}px body padding-${side}`).toHaveCSS(`padding-${side}`, "0px");
    }
  }
});

/** The hero's pieces, by name, for pairwise overlap checks. */
async function heroBoxes(page: Page, withMascot: boolean) {
  const card = page
    .locator("[data-stagger]")
    .filter({ has: page.getByRole("link", { name: homeIntro.workLink }) });
  const boxes: Record<string, Box> = {
    title: await box(title(page)),
    tagline: await box(page.getByText(site.tagline, { exact: true })),
    card: await box(card),
  };
  if (withMascot) {
    const group = page.getByRole("group", { name: mascotLabel });
    boxes.mustang = await box(group);
    boxes.canvas = await box(mascot(page).locator("canvas"));
  }
  return boxes;
}

/** Every pair of named boxes that overlap, as "a/b: area". The mustang and its own canvas nest. */
function overlaps(boxes: Record<string, Box>) {
  const names = Object.keys(boxes);
  const found: string[] = [];
  for (const [i, a] of names.entries()) {
    for (const b of names.slice(i + 1)) {
      if (a === "mustang" && b === "canvas") continue;
      const area = overlap(boxes[a]!, boxes[b]!);
      if (area > 0) found.push(`${a}/${b}: ${Math.round(area)}`);
    }
  }
  return found;
}

for (const [width, height] of [
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`at ${width}x${height} the title, tagline, button, mustang, and intro never overlap`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop sizes run in the desktop project");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(mascot(page)).toBeVisible();
    await settleEntrances(page);

    const boxes = await heroBoxes(page, true);
    expect(overlaps(boxes)).toEqual([]);
    // "See my work" is the hero's one button. It lives inside the intro card, so it is checked
    // against everything except the card that holds it.
    const button = await box(page.getByRole("link", { name: homeIntro.workLink }));
    for (const name of ["title", "tagline", "mustang", "canvas"]) {
      expect(overlap(button, boxes[name]!), `button/${name}`).toBe(0);
    }
    const all = [...Object.values(boxes), button];
    for (const b of all) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
}

for (const [width, height] of [
  [1279, 800],
  [1024, 800],
  [768, 1024],
  [390, 844],
  [320, 640],
] as const) {
  test(`at ${width}px wide there is no mustang and the hero pieces don't overlap`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(title(page)).toBeVisible();
    await settleEntrances(page);
    await expect(page.getByRole("group", { name: mascotLabel })).toHaveCount(0);
    await expect(mascot(page)).toHaveCount(0);

    const boxes = await heroBoxes(page, false);
    expect(overlaps(boxes)).toEqual([]);
    const button = await box(page.getByRole("link", { name: homeIntro.workLink }));
    for (const name of ["title", "tagline"]) {
      expect(overlap(button, boxes[name]!), `button/${name}`).toBe(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
}

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
