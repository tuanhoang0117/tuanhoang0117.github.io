import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mascotCounterLabel, mascotLabel, mascotPrompt } from "../src/content/mascot";
import { homeIntro, school, site } from "../src/content/site";

type Box = { x: number; y: number; width: number; height: number };

const title = (page: Page) => page.getByRole("heading", { level: 1, name: site.name, exact: true });
const mascot = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });
const banner = (page: Page) => page.getByTestId("school-banner");
const overlay = (page: Page) => page.getByTestId("physics-overlay");
const workLink = (page: Page) => page.getByRole("link", { name: homeIntro.workLink });
/** The intro block: photo, label, about text, and the work link. */
const intro = (page: Page) => page.locator("[data-stagger]").filter({ has: workLink(page) });

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  expect(value, "element has a layout box").not.toBeNull();
  return value!;
}

/** Waits for the entrances to finish, so layout is measured at rest, not mid-rise. */
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

const counter = (page: Page) =>
  page.getByRole("group", { name: mascotLabel }).locator("[data-mascot-counter]");

test("the mustang invites a press and counts click, Enter, and Space", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The mustang mounts only at xl and above");
  await page.goto("/");
  const group = page.getByRole("group", { name: mascotLabel });

  const prompt = group.getByText(mascotPrompt, { exact: true });
  await expect(prompt).toBeVisible();
  await expect(counter(page)).toBeVisible();
  await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 0`);
  await expect(counter(page)).toHaveAttribute("aria-live", "polite");
  await expect(counter(page)).toHaveAttribute("aria-atomic", "true");

  await mascot(page).click();
  await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 1`);
  await mascot(page).press("Enter");
  await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 2`);
  await mascot(page).press("Space");
  await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 3`);
  // The same presses still drop tokens.
  await expect(overlay(page)).toHaveAttribute("data-tokens", "3");

  // Prompt and counter both above the mustang, side by side on one line, apart from each other.
  // Tokens pile up at the bottom of the window, so nothing may sit under the mustang.
  await settleEntrances(page);
  const button = await box(mascot(page));
  const promptBox = await box(prompt);
  const counterBox = await box(counter(page));
  expect(promptBox.y + promptBox.height, "prompt above the mustang").toBeLessThanOrEqual(button.y);
  expect(counterBox.y + counterBox.height, "counter above the mustang").toBeLessThanOrEqual(
    button.y,
  );
  expect(overlap(promptBox, counterBox), "prompt/counter").toBe(0);
  expect(Math.abs(promptBox.y - counterBox.y), "prompt and counter share a line").toBeLessThan(2);

  // Local only: a fresh visit starts from zero.
  await page.reload();
  await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 0`);
});

/** The topmost row with token paint on the physics canvas, in CSS px (Infinity if none). */
function tokenTop(page: Page) {
  return overlay(page).evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const { data, width, height } = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / canvas.clientWidth;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] !== 0) return y / scale;
      }
    }
    return Infinity;
  });
}

/** Token paint inside a box on the physics canvas, in device pixels. */
function tokenPaintIn(page: Page, area: Box) {
  return overlay(page).evaluate((el, area) => {
    const canvas = el as HTMLCanvasElement;
    const scale = canvas.width / canvas.clientWidth;
    const x = Math.max(0, Math.floor(area.x * scale));
    const y = Math.max(0, Math.floor(area.y * scale));
    const w = Math.min(canvas.width - x, Math.ceil(area.width * scale));
    const h = Math.min(canvas.height - y, Math.ceil(area.height * scale));
    if (w <= 0 || h <= 0) return 0;
    const { data } = canvas.getContext("2d")!.getImageData(x, y, w, h);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) painted++;
    return painted;
  }, area);
}

for (const [width, height] of [
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`at ${width}x${height} settled tokens never cover the prompt or counter`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The mustang mounts only at xl and above");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(mascot(page)).toBeVisible();
    await settleEntrances(page);
    const group = page.getByRole("group", { name: mascotLabel });
    const prompt = group.getByText(mascotPrompt, { exact: true });

    // Press where a visitor would, without scrolling. Locator clicks retry with a fresh scroll when
    // the press animation makes the button "not stable", which would measure a scrolled page.
    const target = await box(mascot(page));
    const presses = 8;
    for (let i = 0; i < presses; i++) {
      await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    }
    expect(await page.evaluate(() => window.scrollY), "the page did not scroll").toBe(0);
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: ${presses}`);
    await expect(overlay(page)).toHaveAttribute("data-tokens", String(presses));
    // The loop stops once every token sleeps; only then is the pile where it will stay.
    await expect(overlay(page)).toHaveAttribute("data-resting", "true", { timeout: 20_000 });
    await settleEntrances(page);

    const top = await tokenTop(page);
    expect(top, "tokens were drawn").toBeLessThan(height);
    for (const [name, locator] of [
      ["counter", counter(page)],
      ["prompt", prompt],
    ] as const) {
      const b = await box(locator);
      // In view, so "not covered" means the visitor can read it, not that it is off screen.
      expect.soft(b.y, `${name} in view`).toBeGreaterThanOrEqual(0);
      expect.soft(b.y + b.height, `${name} in view`).toBeLessThanOrEqual(height);
      expect.soft(b.y + b.height, `${name} above every settled token`).toBeLessThanOrEqual(top);
      expect.soft(await tokenPaintIn(page, b), `token paint on the ${name}`).toBe(0);
    }
  });
}

test("under reduced motion the counter still counts and nothing moves", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The mustang mounts only at xl and above");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await mascot(page).click();
  await mascot(page).press("Enter");
  await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 2`);
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 1000 })
    .toBe(0);
});

test("below xl there is no prompt or counter, along with no mustang", async ({ page }) => {
  await page.setViewportSize({ width: 1279, height: 800 });
  await page.goto("/");
  await expect(title(page)).toBeVisible();
  await expect(page.getByText(mascotPrompt, { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-mascot-counter]")).toHaveCount(0);
});

/** The pieces the strip must sit clear of, by name, measured at rest. */
async function stripNeighbours(page: Page, withMascot: boolean) {
  const boxes: Record<string, Box> = {
    title: await box(title(page)),
    tagline: await box(page.getByText(site.tagline, { exact: true })),
    intro: await box(intro(page)),
    photo: await box(intro(page).getByRole("img", { name: site.name, exact: true })),
    link: await box(workLink(page)),
  };
  if (withMascot) {
    boxes.mustang = await box(page.getByRole("group", { name: mascotLabel }));
    boxes.canvas = await box(mascot(page).locator("canvas"));
  }
  return boxes;
}

/**
 * The fixed top-corner blocks (home link, menu toggle) as they cover the page: the box plus its
 * 3px block shadow to the right and below (shadow-block-sm).
 */
async function cornerBlocks(page: Page) {
  const covered = async (locator: Locator) => {
    const b = await box(locator);
    return { ...b, width: b.width + 3, height: b.height + 3 };
  };
  return {
    "home link": await covered(page.locator("[data-home-link]")),
    "menu toggle": await covered(
      page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /menu$/ }),
    ),
  };
}

for (const [width, height] of [
  [320, 640],
  [375, 812],
  [768, 1024],
  [1024, 800],
  [1279, 800],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`at ${width}x${height} the school strip tops the page: under the corner blocks, above the name`, async ({
    page,
    isMobile,
  }) => {
    const withMascot = width >= 1280;
    test.skip(isMobile && withMascot, "Desktop sizes run in the desktop project");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(title(page)).toBeVisible();
    await settleEntrances(page);

    const strip = page.getByRole("region", { name: school.shortName, exact: true });
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("data-testid", "school-banner");
    await expect(strip).toHaveAttribute("data-orientation", "horizontal");
    await expect(strip).toHaveCSS("position", "static");
    await expect(strip).toHaveCSS("opacity", "1");

    const body = page.locator("body");
    for (const side of ["top", "right", "bottom", "left"]) {
      await expect(body, `body padding-${side}`).toHaveCSS(`padding-${side}`, "0px");
    }

    const stripBox = await box(strip);

    // Full width, edge to edge, and nothing scrolls sideways.
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(stripBox.x, "strip starts at the left edge").toBe(0);
    expect(stripBox.width, "strip spans the viewport").toBe(clientWidth);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);

    // Below the fixed corner blocks: they neither cover it nor sit under it.
    for (const [name, corner] of Object.entries(await cornerBlocks(page))) {
      expect(overlap(stripBox, corner), `strip/${name}`).toBe(0);
      expect(stripBox.y, `strip below the ${name}`).toBeGreaterThanOrEqual(
        corner.y + corner.height,
      );
    }

    // Above the name, and clear of everything else in the hero.
    const boxes = await stripNeighbours(page, withMascot);
    for (const [name, other] of Object.entries(boxes)) {
      expect(overlap(stripBox, other), `strip/${name}`).toBe(0);
      expect(stripBox.y + stripBox.height, `strip above the ${name}`).toBeLessThanOrEqual(other.y);
    }

    // The topmost thing on the page at the strip's middle row is the strip itself.
    const onTop = await page.evaluate(
      ({ y, w }) =>
        [0.02, 0.25, 0.5, 0.75, 0.98].map(
          (f) => !!document.elementFromPoint(w * f, y)?.closest('[data-testid="school-banner"]'),
        ),
      { y: stripBox.y + stripBox.height / 2, w: clientWidth },
    );
    expect(onTop, "nothing covers the strip").toEqual([true, true, true, true, true]);

    // Scrolling moves the strip with the page: same place in the document, still shown.
    const docTop = () =>
      strip.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
    const before = await docTop();
    await page.evaluate(() => window.scrollBy(0, 400));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // Long enough for any fade (the fixed banner's is 300ms) to have finished.
    await page.waitForTimeout(400);
    expect(await docTop(), "strip keeps its document position").toBe(before);
    await expect(strip).toHaveCSS("opacity", "1");
    await expect(strip).toHaveCSS("position", "static");
    await expect(strip).toHaveAttribute("data-state", "shown");
    await expect(strip).not.toHaveAttribute("aria-hidden", "true");
  });
}

test("the school strip is on the home page only", async ({ page }) => {
  for (const path of ["/portfolio", "/portfolio/remind-app", "/resume", "/contact", "/404"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    await expect(banner(page), path).toHaveCount(0);
  }
});

test("under reduced motion the school strip holds still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const strip = banner(page);
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute("data-copies", "1");
  const text = strip.getByText(school.name, { exact: true });
  const first = await box(text);
  await page.waitForTimeout(500);
  const second = await box(text);
  expect(second.x, "the name does not scroll").toBe(first.x);
  expect(second.y).toBe(first.y);
});

/** The hero's pieces, by name, for pairwise overlap checks. */
async function heroBoxes(page: Page, withMascot: boolean) {
  const boxes: Record<string, Box> = {
    title: await box(title(page)),
    tagline: await box(page.getByText(site.tagline, { exact: true })),
    intro: await box(intro(page)),
    strip: await box(banner(page)),
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
    // "See my work" is the hero's one call to action. It lives inside the intro, so it is checked
    // against everything except the intro that holds it.
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

test("the intro sits open on the graph paper with no card", async ({ page }) => {
  await page.goto("/");
  await settleEntrances(page);

  const block = intro(page);
  await expect(block).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(block).toHaveCSS("box-shadow", "none");
  for (const side of ["top", "right", "bottom", "left"]) {
    await expect(block, `intro border-${side}`).toHaveCSS(`border-${side}-width`, "0px");
  }

  const photo = block.getByRole("img", { name: site.name, exact: true });
  await expect(photo).toHaveCSS("border-top-width", "2px");
  await expect(photo).toHaveCSS("box-shadow", "none");

  const link = workLink(page);
  await expect(link).toHaveCSS("text-decoration-line", "underline");
  await expect(link).toHaveCSS("border-top-width", "0px");
  await expect(link).toHaveCSS("box-shadow", "none");
  await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const label = block.getByText(homeIntro.label, { exact: true });
  await expect(label).toBeVisible();
  const body = await box(block.getByText(homeIntro.body, { exact: true }));
  const labelBox = await box(label);
  expect(labelBox.y + labelBox.height, "label sits above the about text").toBeLessThanOrEqual(
    body.y,
  );
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
