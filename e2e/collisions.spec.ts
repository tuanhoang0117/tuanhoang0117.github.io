import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mascotLabel } from "../src/content/mascot";
import { homeIntro, site } from "../src/content/site";
import { ENTER_DISTANCE_PX } from "../src/components/motion/motion";
import { tokenArt, tokenVisual } from "../src/components/mascot/physics/tokenVisual";

const TOKEN = tokenArt(tokenVisual).radius * 2; // CSS px
/**
 * Tokens come to rest after a few seconds of simulated time, but the simulation runs slower on a
 * busy machine. Every wait in this file is for a real condition, so a long limit costs nothing
 * when things are quick.
 */
const REST_TIMEOUT = 30_000;
test.describe.configure({ timeout: 90_000 });

type Box = { x: number; y: number; width: number; height: number };

const overlay = (page: Page) => page.getByTestId("physics-overlay");
const dropButton = (page: Page) => page.getByRole("button", { name: "Drop token" });
const mascot = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });

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
      { timeout: 10_000 },
    )
    .toBe(0);
}

async function boxOf(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  expect(value, "element has a layout box").not.toBeNull();
  return value!;
}

const rested = (page: Page) =>
  expect(overlay(page)).toHaveAttribute("data-resting", "true", { timeout: REST_TIMEOUT });

/**
 * Presses the mascot's own click handler with a chosen pointer position, because the mascot can't
 * yet toss a token as high as the page's other elements. It is the same path a real click takes:
 * the counter counts it and the physics layer drops a token at that point.
 */
async function pressMascotAt(page: Page, x: number, y: number) {
  await mascot(page).evaluate(
    (button, point) =>
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1, clientX: point.x, clientY: point.y }),
      ),
    { x, y },
  );
}

/**
 * Several presses at one point. A token leaves with a random sideways toss and may roll off what it
 * lands on, so a test that needs one to stay needs more than one to try.
 */
async function pressManyAt(page: Page, x: number, y: number, presses = 6) {
  for (let i = 0; i < presses; i++) await pressMascotAt(page, x, y);
}

/** A real press: hold the lab's button, then drag to where held tokens should appear. */
async function holdAndDropAt(page: Page, x: number, y: number, tokens: number) {
  const button = await boxOf(dropButton(page));
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await expect
    .poll(() => overlay(page).evaluate((el) => Number((el as HTMLElement).dataset.tokens)), {
      timeout: REST_TIMEOUT,
    })
    .toBeGreaterThanOrEqual(tokens);
  await page.mouse.up();
}

/** The rendered box of one word of an element's text, in CSS px. */
function wordBox(locator: Locator, word: string): Promise<Box> {
  return locator.evaluate((element, word) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest("[aria-hidden='true']")) continue;
      const start = (node.textContent ?? "").indexOf(word);
      if (start === -1) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x, y, width, height };
    }
    throw new Error(`No "${word}" in the element`);
  }, word);
}

/** Token paint inside a box on the physics canvas: how many device pixels, and their mean height. */
function paintStats(page: Page, area: Box) {
  return overlay(page).evaluate((el, area) => {
    const canvas = el as HTMLCanvasElement;
    const scale = canvas.width / canvas.clientWidth;
    const x = Math.max(0, Math.floor(area.x * scale));
    const y = Math.max(0, Math.floor(area.y * scale));
    const w = Math.min(canvas.width - x, Math.ceil(area.width * scale));
    const h = Math.min(canvas.height - y, Math.ceil(area.height * scale));
    if (w <= 0 || h <= 0) return { painted: 0, meanY: NaN };
    const { data } = canvas.getContext("2d")!.getImageData(x, y, w, h);
    let painted = 0;
    let sumY = 0;
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] === 0) continue;
      painted++;
      sumY += y + Math.floor(i / w);
    }
    return { painted, meanY: sumY / painted / scale };
  }, area);
}

const paintIn = async (page: Page, area: Box) => (await paintStats(page, area)).painted;

const fullWidthBelow = (page: Page, y: number) => {
  const { width, height } = page.viewportSize()!;
  return { x: 0, y, width, height: height - y };
};

/** Where tokens lying on the floor are painted. */
const floorBand = (page: Page) => fullWidthBelow(page, page.viewportSize()!.height - TOKEN * 2);

/** From the top of the viewport down to a word's middle: where tokens resting on it are painted. */
const aboveWord = (word: Box) => ({ ...word, y: 0, height: word.y + word.height / 2 });

/** Drops tokens on the lab heading's first word, through a real press, and waits for them to rest. */
async function tokensOnLabHeading(page: Page, tokens = 4) {
  const heading = page.getByRole("heading", { level: 1 });
  const word = await wordBox(heading, "Physics");
  await holdAndDropAt(page, word.x + word.width / 2, Math.max(TOKEN, word.y - TOKEN), tokens);
  await rested(page);
  return { heading, word };
}

// Headings word by word, the strip, the photo, cards; never body paragraphs.
test.describe("page elements are solid", () => {
  test("a real press drops tokens that land on a heading's word and stay there", async ({
    page,
  }) => {
    await page.goto("/lab/physics");
    await settleEntrances(page);
    const { word } = await tokensOnLabHeading(page);

    // At rest, with nothing else up there to hold them, tokens are still above the word's middle.
    expect(await paintIn(page, aboveWord(word)), "token paint on top of the word").toBeGreaterThan(
      0,
    );
  });

  test.describe("on the home page", () => {
    test.skip(({ isMobile }) => isMobile, "The mascot mounts only at xl and above");

    test.beforeEach(async ({ page }) => {
      // Tall enough that the floor stays clear of the paragraph and the photo.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await expect(mascot(page)).toBeVisible();
      await settleEntrances(page);
    });

    test("tokens rest on the letters themselves, not on the word's taller text box", async ({
      page,
    }) => {
      const title = page.getByRole("heading", { level: 1, name: site.name, exact: true });
      const word = await wordBox(title, "Hoang");

      await pressManyAt(page, word.x + word.width / 2, word.y);
      await rested(page);

      // The word's box starts well above its capitals. A token on the box ends at or just above
      // the box's top, plus a rotated corner's few pixels; only a token on the letters reaches
      // this band.
      const band = { x: word.x, y: word.y + 11, width: word.width, height: 10 };
      expect(await paintIn(page, band), "token paint down at the letters").toBeGreaterThan(0);
    });

    test("the Cal Poly strip holds tokens as one block", async ({ page }) => {
      const strip = await boxOf(page.getByTestId("school-banner"));
      const { width } = page.viewportSize()!;

      await pressMascotAt(page, width / 2, strip.y - TOKEN);
      await rested(page);

      expect(await paintIn(page, { x: 0, y: 0, width, height: strip.y })).toBeGreaterThan(0);
      expect(await paintIn(page, fullWidthBelow(page, strip.y + strip.height))).toBe(0);
    });

    test("the photo holds tokens", async ({ page }) => {
      const photo = await boxOf(page.getByRole("img", { name: site.name, exact: true }));

      await pressManyAt(page, photo.x + photo.width / 2, photo.y - TOKEN);
      await rested(page);

      const onTop = { x: photo.x, y: photo.y - TOKEN - 8, width: photo.width, height: TOKEN + 8 };
      expect(await paintIn(page, onTop), "token paint on top of the photo").toBeGreaterThan(0);
    });

    test("body paragraphs don't hold tokens", async ({ page }) => {
      const body = await boxOf(page.getByText(homeIntro.body, { exact: true }));

      await pressManyAt(page, body.x + body.width / 2, body.y - TOKEN);
      await rested(page);

      expect(await paintIn(page, body), "no token rests on the paragraph").toBe(0);
      expect(await paintIn(page, floorBand(page)), "they fell to the floor").toBeGreaterThan(0);
    });
  });
});

test.describe("bodies stay in sync with the page", () => {
  /**
   * Holds every finite animation the page starts at its first frame, until the test finishes them.
   * Endless ones, like the shimmer, run as usual.
   */
  function holdEntrances(page: Page) {
    return page.addInitScript(() => {
      const held: Animation[] = [];
      (window as unknown as { __held: Animation[] }).__held = held;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (
        this: Element,
        ...args: Parameters<Element["animate"]>
      ) {
        const animation = animate.apply(this, args);
        if (animation.effect?.getComputedTiming().iterations !== Infinity) {
          animation.pause();
          held.push(animation);
        }
        return animation;
      };
    });
  }

  test("a word's body rises with the page's entrance once it finishes", async ({ page }) => {
    await holdEntrances(page);
    await page.goto("/lab");
    // A route change plays the page's entrance: it starts lower and rises into place. (The first
    // page of a visit has no page entrance.)
    await page.evaluate(() => {
      history.pushState(null, "", "/lab/physics");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    const heading = page.getByRole("heading", { level: 1, name: "Physics Lab" });
    await expect(heading).toBeAttached();
    const held = () =>
      page.evaluate(
        () =>
          (window as unknown as { __held: Animation[] }).__held.filter(
            (animation) => animation.playState === "paused",
          ).length,
      );
    expect(await held(), "the entrance is held at its start").toBeGreaterThan(0);

    // Tokens land on the word while it is still low.
    const low = await wordBox(heading, "Physics");
    await holdAndDropAt(page, low.x + low.width / 2, Math.max(TOKEN, low.y - TOKEN), 6);
    await rested(page);
    const area = { ...low, y: 0, height: low.y + low.height };
    const before = await paintStats(page, area);
    expect(before.painted, "tokens on the low word").toBeGreaterThan(0);

    await page.evaluate(() => {
      for (const animation of (window as unknown as { __held: Animation[] }).__held) {
        if (animation.playState === "paused") animation.finish();
      }
    });
    const settled = await wordBox(heading, "Physics");
    expect(low.y - settled.y, "the word rose into place").toBeCloseTo(ENTER_DISTANCE_PX, 0);

    // Nothing else moves the page, so only re-measuring after the entrance lifts the tokens.
    const rise = async () => before.meanY - (await paintStats(page, area)).meanY;
    await expect.poll(rise, { timeout: REST_TIMEOUT, message: "tokens rose" }).toBeGreaterThan(4);
    await rested(page);
    expect(await rise(), "tokens rose with the word, and no further").toBeLessThan(
      ENTER_DISTANCE_PX + 4,
    );
  });

  /** Scrolls in small steps, one per frame, as a wheel or finger does. */
  async function scrollSmoothly(page: Page, distance: number) {
    await page.evaluate(
      (distance) =>
        new Promise<void>((resolve) => {
          const step = Math.sign(distance) * 6;
          let left = Math.abs(distance);
          const next = () => {
            if (left <= 0) return resolve();
            window.scrollBy(0, step);
            left -= 6;
            requestAnimationFrame(next);
          };
          requestAnimationFrame(next);
        }),
      distance,
    );
  }

  /** Tokens resting on "Physics", with room to scroll the lab page. */
  async function tokensOnScrollingWord(page: Page) {
    await page.goto("/lab/physics");
    await settleEntrances(page);
    await page.evaluate(() => {
      document.documentElement.style.minHeight = "300vh";
    });
    return (await tokensOnLabHeading(page, 6)).heading;
  }

  test("tokens ride a word up and down as the page scrolls", async ({ page }) => {
    const heading = await tokensOnScrollingWord(page);
    const before = await wordBox(heading, "Physics");
    // From the word's middle down a token's height: empty while tokens stay on top of the letters,
    // but where they'd be sitting if they had stayed behind when the word rose. Inset, because a
    // token may rightly settle in the gap at the word's end, lower than the letters' tops.
    const inWord = (word: Box) => ({
      x: word.x + TOKEN,
      y: word.y + word.height / 2,
      width: word.width - TOKEN * 2,
      height: TOKEN,
    });
    expect(await paintIn(page, aboveWord(before))).toBeGreaterThan(0);

    // Scrolling down moves the word up the screen. Tokens must rise with it, off the old spot.
    await scrollSmoothly(page, 40);
    const scrolled = await wordBox(heading, "Physics");
    expect(scrolled.y).toBeLessThan(before.y - 30);
    await rested(page);
    await expect.poll(() => paintIn(page, inWord(scrolled)), "tokens rose with it").toBe(0);
    expect(await paintIn(page, aboveWord(scrolled)), "tokens still above the word").toBeGreaterThan(
      0,
    );

    await scrollSmoothly(page, -40);
    const back = await wordBox(heading, "Physics");
    expect(Math.abs(back.y - before.y)).toBeLessThan(2);
    await rested(page);
    await expect.poll(() => paintIn(page, inWord(back)), "tokens came back down").toBe(0);
    expect(await paintIn(page, aboveWord(back)), "tokens followed it back").toBeGreaterThan(0);
  });

  test("every token falls to the floor when the word under them goes away", async ({ page }) => {
    const heading = await tokensOnScrollingWord(page);
    const { width, height } = page.viewportSize()!;
    await heading.evaluate((element) => {
      element.textContent = "";
    });

    // Nothing announces this change, so the next scroll is what re-measures.
    await page.evaluate(() => window.scrollBy(0, 1));

    // Tokens stacked on other tokens too, not only those touching the word.
    await expect
      .poll(() => paintIn(page, { x: 0, y: 0, width, height: height - TOKEN * 4 }), {
        timeout: REST_TIMEOUT,
      })
      .toBe(0);
    await rested(page);
    expect(await paintIn(page, floorBand(page))).toBeGreaterThan(0);
  });

  test("a word's body moves with the page when the viewport resizes", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Runs once, at a desktop viewport");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/lab/physics");
    await settleEntrances(page);
    const heading = page.getByRole("heading", { level: 1 });
    const wide = await wordBox(heading, "Lab");
    // Over the last word's right end, which the narrower layout pulls out from under them.
    const right = wide.x + wide.width;
    await holdAndDropAt(page, right - TOKEN * 2, Math.max(TOKEN, wide.y - TOKEN), 8);
    await rested(page);
    const old = {
      x: right - TOKEN * 3,
      y: 0,
      width: TOKEN * 3,
      height: wide.y + wide.height / 2,
    };
    expect(await paintIn(page, old), "tokens on the wide layout's word").toBeGreaterThan(0);

    // Narrower than the page's max width, so the centered heading slides left.
    const narrowWidth = 1100;
    await page.setViewportSize({ width: narrowWidth, height: 900 });

    // Nothing of the heading may be left under the old spot, or tokens would rightly land on it.
    // Clear by a whole token, since one may still balance on the word's new end.
    for (const word of ["Physics", "Lab"]) {
      const now = await wordBox(heading, word);
      expect(now.x + now.width + TOKEN, `"${word}" moved out from under them`).toBeLessThan(old.x);
    }
    expect(old.x + old.width, "the old spot is still on screen").toBeLessThanOrEqual(narrowWidth);
    // Until the canvas catches up, its old buffer maps to the wrong place and reads as empty.
    await expect
      .poll(() =>
        overlay(page).evaluate((el) => (el as HTMLCanvasElement).width / devicePixelRatio),
      )
      .toBe(narrowWidth);
    await expect
      .poll(() => paintIn(page, old), { timeout: REST_TIMEOUT, message: "tokens fell" })
      .toBe(0);
  });
});

test("a resting token never catches clicks, hovers, or text selection", async ({ page }) => {
  await page.goto("/lab/physics");
  await settleEntrances(page);
  const { word } = await tokensOnLabHeading(page, 3);

  // Find a painted pixel on a token, and check what's really under the pointer there.
  const sample = await overlay(page).evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const { data, width, height } = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / canvas.clientWidth;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] !== 0) return { x: x / scale, y: y / scale };
      }
    }
    return undefined;
  });
  expect(sample, "a token is on screen").toBeDefined();
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, sample!);
  expect(hit).not.toBe("CANVAS");

  // Selecting the word under the tokens works: double-click on its letters.
  await page.mouse.dblclick(word.x + word.width / 2, word.y + word.height / 2);
  const selected = await page.evaluate(() => getSelection()?.toString().trim());
  expect(selected?.toLowerCase()).toBe("physics");
  await page.evaluate(() => getSelection()?.removeAllRanges());

  // And the button under the layer still takes a press. Playwright's click itself fails if
  // anything else would catch it.
  const before = Number(await overlay(page).getAttribute("data-tokens"));
  await dropButton(page).click();
  await expect
    .poll(async () => Number(await overlay(page).getAttribute("data-tokens")))
    .toBeGreaterThan(before);
});

test("a resting token fades out about ten seconds after it comes to rest", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Time-based: once is enough, and the desktop project has the mascot");
  // The page times it, so the result doesn't depend on how quickly Playwright notices.
  await page.addInitScript(() => {
    const times: { rested?: number; gone?: number } = {};
    (window as unknown as { __fade: typeof times }).__fade = times;
    new MutationObserver(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='physics-overlay']");
      if (!canvas || times.gone !== undefined) return;
      const tokens = Number(canvas.dataset.tokens);
      if (tokens > 0 && canvas.dataset.resting === "true") times.rested ??= performance.now();
      else if (tokens > 0) times.rested = undefined;
      else if (times.rested !== undefined) times.gone = performance.now();
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-resting", "data-tokens"],
    });
  });
  await page.goto("/");
  await expect(mascot(page)).toBeVisible();
  await settleEntrances(page);
  const box = await boxOf(mascot(page));

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await rested(page);
  await expect(overlay(page)).toHaveAttribute("data-tokens", "0", { timeout: 40_000 });

  const { rested: restedAt, gone } = await page.evaluate(
    () => (window as unknown as { __fade: { rested: number; gone: number } }).__fade,
  );
  const restedFor = gone - restedAt;
  // Written out, not imported, so changing the constant can't quietly change the promise: about
  // ten seconds, with room for a late timer on a busy machine. Unit tests pin the exact timing.
  expect(restedFor).toBeGreaterThanOrEqual(9_500);
  expect(restedFor).toBeLessThan(20_000);
  expect(await paintIn(page, fullWidthBelow(page, 0)), "nothing left painted").toBe(0);
});

test.describe("reduced motion, overflow, and accessibility", () => {
  test("under reduced motion there is no physics at all", async ({ page, isMobile }) => {
    test.skip(isMobile, "The mascot mounts only at xl and above");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(mascot(page)).toBeVisible();
    await pressMascotAt(page, 300, 100);
    await expect(page.getByTestId("physics-overlay")).toHaveCount(0);
  });

  for (const width of [320, 375]) {
    test(`no horizontal overflow at ${width}px with tokens on a word`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/lab/physics");
      await settleEntrances(page);
      await tokensOnLabHeading(page, 3);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  test("has no accessibility violations with tokens resting on a word", async ({ page }) => {
    await page.goto("/lab/physics");
    await settleEntrances(page);
    await tokensOnLabHeading(page, 3);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
  });
});
