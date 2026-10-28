import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { projects } from "../src/content/projects";
import { pageThemes } from "../src/styles/themes";

const LAB = "/lab/motion";
const CARD_COUNT = projects.length;
// Routes whose content a visitor sees first. Each one's main content must be fully visible.
const ROUTES = ["/", "/portfolio", "/resume", "/contact", LAB];

/** Resolves once every animation on the page has finished (or after `timeout` ms). */
async function settle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 3000 })
    .toBe(0);
}

/** Like `settle`, but ignores endless loops (the banner scrolls forever). */
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

/**
 * Clicks a main-nav link from inside the page, then waits for the first animation frame in
 * which the new page is in the DOM. Reports what that first frame looks like, and the page
 * wrapper's position, so it can be compared with the settled state.
 */
function navigateAndCaptureFirstFrame(page: Page, href: string) {
  return page.evaluate(async (href) => {
    const link = document.querySelector<HTMLAnchorElement>(
      `nav[aria-label="Main"] a[href="${href}"]`,
    );
    if (!link) throw new Error(`no nav link to ${href}`);
    const before = document.querySelector("h1")?.textContent;
    link.click();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (document.querySelector("h1")?.textContent !== before) break;
    }
    const wrapper = document.querySelector<HTMLElement>("[data-page-transition]")!;
    const animations = wrapper.getAnimations();
    const rect = wrapper.getBoundingClientRect();
    return {
      headings: [...document.querySelectorAll("h1")].map((h) => h.textContent),
      opacity: Number(getComputedStyle(wrapper).opacity),
      durations: animations.map((a) => Number(a.effect?.getTiming().duration)),
      rect: { x: rect.x, y: rect.y, width: rect.width },
      top: parseFloat(getComputedStyle(wrapper).top) || 0,
      transform: getComputedStyle(wrapper).transform,
    };
  }, href);
}

/**
 * Every card, and every top-level block of the page's main content, that is invisible, clipped,
 * or pushed off-screen. Opacity is multiplied up the ancestor chain, so a faded wrapper counts.
 * Nothing scrolls: positions are measured from the top of the page as loaded.
 */
function hiddenContent(page: Page) {
  return page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll<HTMLElement>("[data-page-transition] > *"),
      ...document.querySelectorAll<HTMLElement>("[data-stagger] > *"),
    ];
    const problems: string[] = [];
    for (const el of targets) {
      const name = `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}"`;
      let opacity = 1;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const style = getComputedStyle(n);
        opacity *= Number(style.opacity);
        if (style.visibility === "hidden") problems.push(`${name}: visibility hidden`);
        if (style.transform !== "none") problems.push(`${name}: transform ${style.transform}`);
        if (style.clipPath !== "none") problems.push(`${name}: clip-path ${style.clipPath}`);
      }
      if (opacity < 1) problems.push(`${name}: opacity ${opacity}`);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) problems.push(`${name}: zero size`);
      if (r.left < 0 || r.right > document.documentElement.clientWidth || r.top + scrollY < 0) {
        problems.push(`${name}: off-screen at ${r.left},${r.top}`);
      }
    }
    return { count: targets.length, problems };
  });
}

const cards = (page: Page) => page.getByTestId("motion-card");

interface LoggedAnimation {
  /** The heading id of the Stagger list the element is in, or "page" for the route wrapper. */
  list: string;
  delay: number;
  duration: number;
}

/**
 * Logs every Web Animations call as the page makes it. Finished entrances drop out of
 * document.getAnimations(), so reading them afterwards would race the animations themselves.
 */
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const log: LoggedAnimation[] = [];
    (window as unknown as { motionLog: LoggedAnimation[] }).motionLog = log;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const timing = typeof options === "object" ? options : {};
      const section = this.closest("section[aria-labelledby]");
      log.push({
        list: this.matches("[data-page-transition]")
          ? "page"
          : (section?.getAttribute("aria-labelledby")?.replace("motion-", "") ?? "?"),
        delay: Number(timing.delay ?? 0),
        duration: Number(timing.duration),
      });
      return original.call(this, keyframes, options);
    };
  });
}

const animationLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { motionLog: LoggedAnimation[] }).motionLog);

test.describe("route transition", () => {
  test("the incoming page eases in from its first frame, then settles in place", async ({
    page,
  }) => {
    await page.goto(LAB);
    await settle(page);

    const first = await navigateAndCaptureFirstFrame(page, "/resume");
    // Only the new page is in the DOM: the old one doesn't linger or flash.
    expect(first.headings).toEqual(["Resume"]);
    // The first frame showing the new page is already faded, not at full opacity.
    expect(first.opacity).toBeLessThan(0.5);
    // The rise is a relative `top` offset, never a transform (see the fixed-element tests below).
    expect(first.transform).toBe("none");
    expect(first.top).toBeGreaterThan(0);
    expect(first.top).toBeLessThanOrEqual(8);
    expect(first.durations).toHaveLength(1);
    expect(first.durations[0]).toBeGreaterThanOrEqual(200);
    expect(first.durations[0]).toBeLessThanOrEqual(350);

    await settle(page);
    const wrapper = page.locator("[data-page-transition]");
    await expect(wrapper).toHaveCSS("opacity", "1");
    await expect(wrapper).toHaveCSS("transform", "none");
    await expect(wrapper).toHaveCSS("top", "0px");

    // No layout jump: only a small upward move, never a horizontal shift or a resize.
    const settled = (await wrapper.boundingBox())!;
    expect(first.rect.x).toBe(settled.x);
    expect(first.rect.width).toBe(settled.width);
    expect(first.rect.y - settled.y).toBeGreaterThanOrEqual(0);
    expect(first.rect.y - settled.y).toBeLessThanOrEqual(8);
  });

  test("the first page of a visit isn't faded; its cards still enter", async ({ page }) => {
    await recordAnimations(page);
    await page.goto(LAB);
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    const log = await animationLog(page);
    expect(log.filter((a) => a.list === "page")).toEqual([]);
    expect(log).toHaveLength(CARD_COUNT);
  });

  test("runs on every route change, not only the first", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    for (const href of ["/portfolio", "/resume", "/contact"]) {
      const first = await navigateAndCaptureFirstFrame(page, href);
      expect(first.durations, href).toHaveLength(1);
      expect(first.opacity, href).toBeLessThan(0.5);
      await settle(page);
    }
  });
});

/**
 * Goes to `from`, then to `target` by history navigation inside the app (an in-app link, then
 * Back), so the route transition runs. A direct load skips it. Returns what `measure` saw on the
 * first animation frame showing `selector`, while the page animation was still running, and
 * again once everything had settled.
 */
async function reachByRouteChange<T>(
  page: Page,
  target: string,
  selector: string,
  measure: (el: Element) => T,
) {
  await page.goto(target);
  await settleEntrances(page);
  await page.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('nav[aria-label="Main"] a[href="/resume"]')!.click(),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Resume" })).toBeVisible();
  await settleEntrances(page);
  await page.evaluate(
    ([selector, source]) => {
      const w = window as unknown as { firstFrame?: unknown };
      window.addEventListener(
        "popstate",
        async () => {
          for (let i = 0; i < 120 && !document.querySelector(selector); i++) {
            await new Promise((r) => requestAnimationFrame(r));
          }
          const wrapper = document.querySelector("[data-page-transition]")!;
          const measureFn = new Function(`return (${source})`)() as (el: Element) => unknown;
          w.firstFrame = {
            animating: wrapper.getAnimations().length > 0,
            opacity: Number(getComputedStyle(wrapper).opacity),
            value: measureFn(document.querySelector(selector)!),
          };
        },
        { once: true },
      );
    },
    [selector, measure.toString()] as const,
  );
  await page.goBack();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { firstFrame?: unknown }).firstFrame))
    .toBeTruthy();
  const first = (await page.evaluate(
    () => (window as unknown as { firstFrame: unknown }).firstFrame,
  )) as { animating: boolean; opacity: number; value: T };
  await settleEntrances(page);
  const settled = await page.locator(selector).evaluate(measure);
  return { first, settled };
}

test.describe("fixed elements during the route transition", () => {
  test("the physics canvas matches the viewport after in-app navigation", async ({ page }) => {
    const { first, settled } = await reachByRouteChange(
      page,
      "/lab/physics",
      '[data-testid="physics-overlay"]',
      (el) => {
        const c = el as HTMLCanvasElement;
        return {
          width: c.width,
          height: c.height,
          clientWidth: c.clientWidth,
          clientHeight: c.clientHeight,
          dpr: window.devicePixelRatio,
          viewWidth: document.documentElement.clientWidth,
          viewHeight: window.innerHeight,
        };
      },
    );
    // The measurement really happened mid-transition, not after it.
    expect(first.animating).toBe(true);
    expect(first.opacity).toBeLessThan(1);
    for (const v of [first.value, settled]) {
      expect(v.clientWidth).toBe(v.viewWidth);
      expect(v.clientHeight).toBe(v.viewHeight);
      expect(v.width).toBe(Math.round(v.clientWidth * v.dpr));
      expect(v.height).toBe(Math.round(v.clientHeight * v.dpr));
    }
  });

  test("the banner sits on the viewport edge from the first frame after in-app navigation", async ({
    page,
  }) => {
    const { first, settled } = await reachByRouteChange(
      page,
      "/lab/banner",
      '[data-testid="school-banner"]',
      (el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          viewWidth: document.documentElement.clientWidth,
          viewHeight: window.innerHeight,
          vertical: (el as HTMLElement).dataset.orientation === "vertical",
        };
      },
    );
    expect(first.animating).toBe(true);
    for (const v of [first.value, settled]) {
      expect(v.right).toBe(v.viewWidth);
      expect(v.bottom).toBe(v.viewHeight);
      if (v.vertical) expect(v.top).toBe(0);
      else expect(v.left).toBe(0);
    }
  });
});

test.describe("card entrances on /lab/motion", () => {
  test("cards enter one after another on load, without scrolling", async ({ page }) => {
    await recordAnimations(page);
    await page.goto(LAB);
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    const log = await animationLog(page);
    for (const list of ["portfolio"]) {
      const delays = log.filter((a) => a.list === list).map((a) => a.delay);
      expect(delays, list).toHaveLength(projects.length);
      expect(delays[0], list).toBe(0);
      for (const [i, delay] of delays.slice(1).entries()) {
        expect(delay - delays[i]!, list).toBeGreaterThanOrEqual(40);
        expect(delay - delays[i]!, list).toBeLessThanOrEqual(80);
      }
    }
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test("replaying remounts the lists and plays the entrances again", async ({ page }) => {
    await page.goto(LAB);
    await settle(page);
    await page.getByRole("button", { name: "Replay entrances" }).click();
    expect(await page.evaluate(() => document.querySelectorAll("[data-stagger] > *").length)).toBe(
      CARD_COUNT,
    );
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
    await settle(page);
    expect((await hiddenContent(page)).problems).toEqual([]);
  });

  test("early in the entrance, every card's text still passes accessibility checks", async ({
    page,
  }) => {
    // Other pages' axe tests run right after load, while their cards may still be entering.
    // Freeze every card early in its entrance (10%, where a fade would still be faint) and
    // check what a visitor sees then.
    await page.goto(LAB);
    await settle(page);
    // Click and freeze in one step, so no entrance finishes before it's frozen.
    const frozen = await page.evaluate(async () => {
      const replay = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Replay"),
      )!;
      replay.click();
      for (
        let i = 0;
        i < 60 && !document.querySelector("[data-stagger] > *")?.getAnimations().length;
        i++
      ) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const cardsInLists = new Set(document.querySelectorAll("[data-stagger] > *"));
      const animations = document
        .getAnimations()
        .filter((a) => cardsInLists.has((a.effect as KeyframeEffect).target!));
      for (const a of animations) {
        const { delay, duration } = a.effect!.getTiming();
        a.pause();
        a.currentTime = Number(delay) + Number(duration) * 0.1;
      }
      return animations.length;
    });
    expect(frozen).toBe(CARD_COUNT);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe("no hidden content", () => {
  for (const path of ROUTES) {
    test(`${path}: once animations finish, all main content is visible in place`, async ({
      page,
    }) => {
      await page.goto(path);
      await settle(page);
      const { count, problems } = await hiddenContent(page);
      expect(count).toBeGreaterThan(0);
      expect(problems).toEqual([]);
    });
  }

  test("every card is visible on /lab/motion once animations finish", async ({ page }) => {
    await page.goto(LAB);
    await settle(page);
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    for (const card of await cards(page).all()) {
      await expect(card).toHaveCSS("opacity", "1");
    }
    const { count, problems } = await hiddenContent(page);
    // The page header, the demo sections' container, and every card.
    expect(count).toBe(CARD_COUNT + 2);
    expect(problems).toEqual([]);
  });

  test("if animations never run, every card is visible at once", async ({ page }) => {
    // Stands in for a browser that can't animate: no Web Animations API at all.
    await page.addInitScript(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });
    await page.goto(LAB);
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect((await hiddenContent(page)).problems).toEqual([]);
  });
});

test.describe("reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("pages and cards appear in their final state, with no animation", async ({ page }) => {
    await recordAnimations(page);
    await page.goto(LAB);
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    expect(await animationLog(page)).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(cards(page)).toHaveCount(CARD_COUNT);
    expect((await hiddenContent(page)).problems).toEqual([]);

    const first = await navigateAndCaptureFirstFrame(page, "/portfolio");
    expect(first.headings).toEqual(["Portfolio"]);
    expect(first.durations).toEqual([]);
    expect(first.opacity).toBe(1);
    expect(await animationLog(page)).toEqual([]);
  });

  test("hovering a card doesn't move it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "touch devices have no hover");
    await page.goto(LAB);
    const card = cards(page).first();
    await card.hover();
    await expect(card).toHaveCSS("translate", "none");
  });

  test("hover and keyboard focus still grow the shadow, instantly, without moving the card", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "touch devices have no hover");
    await page.goto(LAB);
    const card = cards(page).first();
    const rest = (await card.boundingBox())!;
    await card.hover();
    await expect(card).toHaveCSS("box-shadow", / 10px 10px 0px 0px$/);
    expect(await card.boundingBox()).toEqual(rest);
    // index.css cuts transitions to 0.01ms under reduced motion, so the change is instant.
    expect(
      parseFloat(await card.evaluate((el) => getComputedStyle(el).transitionDuration)),
    ).toBeLessThan(0.001);

    await page.mouse.move(0, 0);
    await tabTo(page, '[data-testid="motion-card"]');
    await expect(card).toHaveCSS("box-shadow", / 10px 10px 0px 0px$/);
    await expect(card).toHaveCSS("translate", "none");
  });
});

/** Presses Tab until keyboard focus is on (or inside) an element matching `selector`. */
async function tabTo(page: Page, selector: string) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((s) => !!document.activeElement?.closest(s), selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

test.describe("card float on touch", () => {
  test.skip(({ isMobile }) => !isMobile, "needs touch emulation");

  test("tapping a card doesn't leave it raised", async ({ page }) => {
    // A focusable, non-link card (a stack card), so the tap focuses it and stays on the page.
    await page.goto("/resume");
    await page.getByRole("button", { name: /^pause scrolling$/i }).tap();
    const card = page
      .getByRole("region", { name: /skills/i })
      .getByRole("listitem")
      .first();
    // The card's offset from its list: unlike page coordinates, it doesn't change if the page
    // scrolls or settles, only if the card itself moves.
    const offset = () =>
      card.evaluate(
        (el) => el.getBoundingClientRect().top - el.parentElement!.getBoundingClientRect().top,
      );
    const rest = await offset();
    await card.tap();
    await expect(card).toBeFocused();
    // Past the 200ms transition, so a raised state would have landed.
    await page.waitForTimeout(400);
    await expect(card).toHaveCSS("translate", "none");
    await expect(card).toHaveCSS("box-shadow", / 3px 3px 0px 0px$/);
    expect(await offset()).toBe(rest);
  });
});

test.describe("card hover and press", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "touch devices have no hover; hover styles need (hover: hover)",
  );

  /**
   * The outermost (last) layer of a block shadow: its color and offset in px. Pass a card index,
   * or a shadow color class to read the expected color from a throwaway element that uses the
   * same utilities.
   */
  const blockShadow = (page: Page, target: number | string) =>
    page.evaluate((target) => {
      let el: Element;
      let probe: HTMLElement | undefined;
      if (typeof target === "number") {
        el = document.querySelectorAll('[data-testid="motion-card"]')[target]!;
      } else {
        probe = document.createElement("span");
        probe.className = `shadow-block ${target}`;
        document.body.append(probe);
        el = probe;
      }
      const value = getComputedStyle(el).boxShadow;
      probe?.remove();
      const last = /(\S+\([^)]*\)|\S+) (-?[\d.]+)px (-?[\d.]+)px 0px 0px$/.exec(value);
      return last ? { color: last[1], x: Number(last[2]), y: Number(last[3]) } : { value };
    }, target);

  // The project cards take the Portfolio theme's accents in order (cardShadow()).
  const accents = pageThemes.portfolio.shadows;

  test("hover floats the card straight up and grows its accent shadow; press pushes it down", async ({
    page,
  }) => {
    await page.goto(LAB);
    await settle(page);
    const card = cards(page).first();
    const { color } = await blockShadow(page, accents[0]);
    expect(color).toBeTruthy();

    expect(await blockShadow(page, 0)).toEqual({ color, x: 6, y: 6 });
    await expect(card).toHaveCSS("translate", "none");
    const rest = (await card.boundingBox())!;

    await card.hover();
    await expect(card).toHaveCSS("translate", "0px -4px");
    await expect.poll(() => blockShadow(page, 0)).toEqual({ color, x: 10, y: 10 });
    // Once the transition ends, the box sits 4px higher and exactly as far left as at rest.
    await expect.poll(async () => (await card.boundingBox())!.y).toBe(rest.y - 4);
    const raised = (await card.boundingBox())!;
    expect(raised.x).toBe(rest.x);
    expect(raised.width).toBe(rest.width);

    await page.mouse.down();
    await expect(card).toHaveCSS("translate", "0px 2px");
    await expect.poll(() => blockShadow(page, 0)).toEqual({ color, x: 3, y: 3 });
    // No mouse up: releasing would click the card's link and leave the page.
  });

  test("the float eases out over 200 to 250ms", async ({ page }) => {
    await page.goto(LAB);
    const timing = await cards(page)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { duration: parseFloat(s.transitionDuration), easing: s.transitionTimingFunction };
      });
    expect(timing.duration).toBeGreaterThanOrEqual(0.2);
    expect(timing.duration).toBeLessThanOrEqual(0.25);
    // Tailwind's `ease-out`: a soft deceleration, not steps() and not linear.
    expect(timing.easing).toBe("cubic-bezier(0, 0, 0.2, 1)");
  });

  test("keyboard focus floats a link card and a card that contains the focused link", async ({
    page,
  }) => {
    await page.goto(LAB);
    await settle(page);
    const card = cards(page).first();
    await tabTo(page, '[data-testid="motion-card"]');
    await expect(card).toBeFocused();
    await expect(card).toHaveCSS("translate", "0px -4px");
    await expect
      .poll(() => blockShadow(page, 0))
      .toEqual({ color: expect.anything(), x: 10, y: 10 });

    // A portfolio card is an article whose main link is inside it.
    await page.goto("/portfolio");
    await settleEntrances(page);
    await tabTo(page, '[data-testid="project-card"]');
    const article = page.locator('[data-testid="project-card"]:has(:focus-visible)');
    await expect(article).toHaveCount(1);
    await expect(article).toHaveCSS("translate", "0px -4px");
    await expect(article).toHaveCSS("box-shadow", / 14px 14px 0px 0px$/);
  });

  test("contact, stack and case-study cards float on hover too", async ({ page }) => {
    await page.goto("/contact");
    await settle(page);
    const contact = page.getByTestId("contact-card");
    await contact.hover({ position: { x: 4, y: 4 } });
    await expect(contact).toHaveCSS("translate", "0px -4px");
    await expect(contact).toHaveCSS("box-shadow", / 14px 14px 0px 0px$/);

    await page.goto("/resume");
    await page.getByRole("button", { name: /^pause scrolling$/i }).click();
    const stack = page
      .getByRole("region", { name: /skills/i })
      .getByRole("listitem")
      .first();
    await stack.hover();
    await expect(stack).toHaveCSS("translate", "0px -4px");
    await expect(stack).toHaveCSS("box-shadow", / 6px 6px 0px 0px$/);

    await page.goto(`/portfolio/${projects.find((p) => p.caseStudy)!.slug}`);
    await settleEntrances(page);
    const section = page.locator("main [data-section]").first();
    await section.hover({ position: { x: 4, y: 4 } });
    await expect(section).toHaveCSS("translate", "0px -4px");
    await expect(section).toHaveCSS("box-shadow", / 14px 14px 0px 0px$/);
  });

  test("every card keeps its own accent color when its shadow grows", async ({ page }) => {
    await page.goto(LAB);
    await settle(page);
    for (const [i, shadowClass] of accents.entries()) {
      const { color } = await blockShadow(page, shadowClass);
      expect(await blockShadow(page, i), shadowClass).toEqual({ color, x: 6, y: 6 });
      await cards(page).nth(i).hover();
      await expect
        .poll(() => blockShadow(page, i), { message: shadowClass })
        .toEqual({ color, x: 10, y: 10 });
    }
  });
});

test("/lab/motion has no accessibility violations", async ({ page }) => {
  await page.goto(LAB);
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
});

test("/lab/motion has no horizontal overflow at 375px, during and after entrances", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(LAB);
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await overflow()).toBe(0);
  await settle(page);
  expect(await overflow()).toBe(0);
});
