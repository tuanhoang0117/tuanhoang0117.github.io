import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { navLinks } from "../src/content/site";
import { contrastRatio, type Color } from "./helpers/checkContrast";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const toggle = (page: Page) => nav(page).getByRole("button", { name: /menu$/ });

async function panel(page: Page) {
  const id = await toggle(page).getAttribute("aria-controls");
  return page.locator(`[id="${id}"]`);
}

/** Waits a frame for transitions to start, then until every menu transition has finished. */
async function settle(page: Page) {
  await nav(page).evaluate(async (el) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
  });
}

/** Opens the menu the way this device would: a tap on touch screens, a click elsewhere. */
async function openByPointer(page: Page, isMobile: boolean) {
  if (isMobile) await toggle(page).tap();
  else await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
}

/** Where the panel and first label sit: 0 offsets mean fully in place. */
function placement(page: Page) {
  return page.evaluate(() => {
    const id = document
      .querySelector('nav[aria-label="Main"] button')!
      .getAttribute("aria-controls")!;
    const panel = document.getElementById(id)!;
    const label = panel.querySelector("[data-menu-label]")!;
    const p = panel.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    const mask = label.parentElement!.getBoundingClientRect();
    return {
      panelOffset: Math.round(p.right - document.documentElement.clientWidth),
      labelOffset: Math.round(l.top - mask.top),
      visibility: getComputedStyle(panel).visibility,
    };
  });
}

/** Longest transition (duration plus delay, in ms) on the toggle lines, backdrop, panel, labels. */
function longestTransition(page: Page) {
  return nav(page).evaluate((navEl) => {
    const ms = (list: string) =>
      list.split(",").map((t) => parseFloat(t) * (t.trim().endsWith("ms") ? 1 : 1000));
    const els = navEl.querySelectorAll(
      "button span, [data-menu-backdrop], [id], [data-menu-label]",
    );
    return Math.max(
      ...[...els].map((el) => {
        const cs = getComputedStyle(el);
        const durations = ms(cs.transitionDuration);
        const delays = ms(cs.transitionDelay);
        return Math.max(...durations.map((d, i) => d + (delays[i % delays.length] ?? 0)));
      }),
    );
  });
}

/** Opens the menu with Enter and waits for focus to reach the first link. */
async function openByKeyboard(page: Page) {
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect((await panel(page)).getByRole("link").first()).toBeFocused();
}

/** Parts of the menu (toggle, dim layer, panel) still showing over the focused element. */
function menuPartsOverFocus(page: Page) {
  return page.evaluate(() => {
    const focused = document.activeElement!;
    const f = focused.getBoundingClientRect();
    const navEl = document.querySelector('nav[aria-label="Main"]')!;
    const toggleEl = navEl.querySelector("button")!;
    const parts = {
      toggle: toggleEl,
      backdrop: navEl.querySelector("[data-menu-backdrop]")!,
      panel: document.getElementById(toggleEl.getAttribute("aria-controls")!)!,
    };
    return Object.entries(parts)
      .filter(([, el]) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.left < f.right && f.left < r.right && r.top < f.bottom && f.top < r.bottom;
      })
      .map(([name]) => `${name} covers ${focused.tagName} "${focused.textContent?.trim()}"`);
  });
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help}`);
}

/** Any CSS color (oklab, color-mix, hex) as 0-255 RGBA, read back through a canvas. */
function rgba(page: Page, colors: string[]): Promise<Color[]> {
  return page.evaluate((list) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    return list.map((color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: r!, g: g!, b: b!, a: a! / 255 };
    });
  }, colors);
}

/** The open panel's surface: its backdrop filter, tint and left edge (colors as RGBA). */
async function surface(page: Page) {
  const style = await (
    await panel(page)
  ).evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      backdropFilter: cs.backdropFilter,
      tint: cs.backgroundColor,
      edge: cs.borderLeftColor,
      edgeWidth: cs.borderLeftWidth,
    };
  });
  const [tint, edge] = await rgba(page, [style.tint, style.edge]);
  return { ...style, tint: tint!, edge: edge! };
}

/** Chromium's media emulation; Playwright's emulateMedia has no option for this query. */
async function emulateReducedTransparency(page: Page, value: "reduce" | "no-preference") {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value }],
  });
}

/**
 * Contrast of each link against what is actually rendered behind its text: the link boxes are
 * screenshotted with the text hidden, and the link color is checked against the darkest and the
 * lightest pixel of that backdrop.
 */
async function linkContrastOverPage(page: Page) {
  const links = (await panel(page)).getByRole("link");
  const hidden = await page.addStyleTag({
    content: "[data-menu-label] { color: transparent !important; }",
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  const backdrops: Color[][] = [];
  for (let i = 0; i < navLinks.length; i++) {
    const box = (await links.nth(i).boundingBox())!;
    const shot = await page.screenshot({
      clip: { x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 },
    });
    backdrops.push(
      await page.evaluate(async (png) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
        let lo = [255, 255, 255];
        let hi = [0, 0, 0];
        for (let j = 0; j < data.length; j += 4) {
          const px = [data[j]!, data[j + 1]!, data[j + 2]!];
          if (lum(px) < lum(lo)) lo = px;
          if (lum(px) > lum(hi)) hi = px;
        }
        return [lo, hi].map(([r, g, b]) => ({ r: r!, g: g!, b: b!, a: 1 }));
      }, shot.toString("base64")),
    );
  }
  await hidden.evaluate((el) => (el as Element).remove());
  const colors = await rgba(
    page,
    await links.evaluateAll((els) => els.map((el) => getComputedStyle(el).color)),
  );
  const fmt = (c: Color) => `rgb(${c.r}, ${c.g}, ${c.b})`;
  return navLinks.map((l, i) => {
    const [darkest, lightest] = backdrops[i]!;
    const text = colors[i]!;
    return {
      label: l.label,
      ratio: Math.min(contrastRatio(text, darkest!), contrastRatio(text, lightest!)),
      text: fmt(text),
      backdrop: `${fmt(darkest!)} to ${fmt(lightest!)}`,
    };
  });
}

test.describe("menu", () => {
  test("opens on click or tap: X lines, panel in place, page dimmed", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await expect(toggle(page)).toHaveAccessibleName("Open menu");
    await openByPointer(page, isMobile);
    await expect(toggle(page)).toHaveAccessibleName("Close menu");
    await settle(page);

    const p = await panel(page);
    await expect(p).toBeVisible();
    expect(await placement(page)).toEqual({
      panelOffset: 0,
      labelOffset: 0,
      visibility: "visible",
    });
    for (const l of navLinks) await expect(p.getByRole("link", { name: l.label })).toBeVisible();
    await expect(page.locator("[data-menu-backdrop]")).toHaveCSS("opacity", "1");

    const lines = toggle(page).locator("span");
    await expect(lines.nth(0)).toHaveCSS("rotate", "45deg");
    await expect(lines.nth(1)).toHaveCSS("opacity", "0");
    await expect(lines.nth(2)).toHaveCSS("rotate", "-45deg");
  });

  for (const key of ["Enter", "Space"]) {
    test(`opens with ${key} and focuses the first link`, async ({ page }) => {
      await page.goto("/");
      await toggle(page).focus();
      await page.keyboard.press(key);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect((await panel(page)).getByRole("link").first()).toBeFocused();
    });
  }

  test("opens on hover only where the device can hover", async ({ page, isMobile }) => {
    await page.goto("/");
    await toggle(page).hover();
    await page.waitForTimeout(300);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", isMobile ? "false" : "true");
  });

  test("closes on Escape and returns focus to the toggle", async ({ page }) => {
    await page.goto("/");
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    // Focus starts inside the panel, so returning it to the toggle is a real move.
    await expect((await panel(page)).getByRole("link").first()).toBeFocused();
    await settle(page);
    await page.keyboard.press("Escape");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page)).toBeFocused();
    await settle(page);
    await expect(await panel(page)).toBeHidden();
  });

  for (const path of ["/", "/resume", "/contact"]) {
    test(`on ${path}, a Tab past the last link closes the menu and the page's focus shows`, async ({
      page,
    }) => {
      await page.goto(path);
      await openByKeyboard(page);
      const links = (await panel(page)).getByRole("link");
      for (let i = 1; i < navLinks.length; i++) {
        await page.keyboard.press("Tab");
        await expect(links.nth(i)).toBeFocused();
        await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      }

      await page.keyboard.press("Tab");
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      // Focus went on into the page instead of being pulled back to the toggle.
      const where = await page.evaluate(() => ({
        inPage: document.activeElement !== document.body,
        inNav: !!document.activeElement?.closest('nav[aria-label="Main"]'),
      }));
      expect(where).toEqual({ inPage: true, inNav: false });
      await settle(page);
      expect(await menuPartsOverFocus(page)).toEqual([]);
    });
  }

  test("Shift+Tab from the first link to the toggle keeps the menu open", async ({ page }) => {
    await page.goto("/");
    await openByKeyboard(page);
    await page.keyboard.press("Shift+Tab");
    await expect(toggle(page)).toBeFocused();
    await page.waitForTimeout(300);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  });

  test("going Back closes the menu on the previous page", async ({ page, isMobile }) => {
    await page.goto("/");
    await openByPointer(page, isMobile);
    await settle(page);
    await (await panel(page)).getByRole("link", { name: "Resume" }).click();
    await expect(page).toHaveURL("/resume");
    // The router commits a navigation a moment after the URL changes; wait for the page itself.
    await expect(page.locator("h1")).toHaveText("Resume");

    // Opened by keyboard, so focus sits on a panel link when Back fires.
    await openByKeyboard(page);
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page)).toBeFocused();
    await settle(page);
    await expect(await panel(page)).toBeHidden();

    await page.goForward();
    await expect(page).toHaveURL("/resume");
    await settle(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("closes on the X", async ({ page, isMobile }) => {
    await page.goto("/");
    await openByPointer(page, isMobile);
    await settle(page);
    if (isMobile) await toggle(page).tap();
    else await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await settle(page);
    await expect(await panel(page)).toBeHidden();
  });

  test("closes when the pointer leaves the panel and toggle", async ({ page, isMobile }) => {
    test.skip(isMobile, "Touch screens have no pointer to leave.");
    await page.goto("/");
    await toggle(page).hover();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await settle(page);

    // From the toggle into the panel: stays open.
    await (await panel(page)).getByRole("link").last().hover();
    await page.waitForTimeout(500);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");

    await page.mouse.move(8, 400);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("choosing a link shows the new page while the panel slides away", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await openByPointer(page, isMobile);
    await settle(page);
    const link = (await panel(page)).getByRole("link", { name: "Resume" });
    if (isMobile) await link.tap();
    else await link.click();
    // Frame by frame until the new page renders: the panel must still be on its way out.
    const frame = await page.evaluate(async () => {
      const id = document
        .querySelector('nav[aria-label="Main"] button')!
        .getAttribute("aria-controls")!;
      const p = document.getElementById(id)!;
      for (let i = 0; i < 120 && document.querySelector("h1")?.textContent !== "Resume"; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      return {
        h1: document.querySelector("h1")?.textContent,
        sliding: p.getAnimations().some((a) => a.playState === "running"),
      };
    });
    expect(frame).toEqual({ h1: "Resume", sliding: true });
    await expect(page).toHaveURL("/resume");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("closed panel links are out of the tab order and the accessibility tree", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(nav(page).getByRole("link")).toHaveCount(0);
    const p = await panel(page);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const inPanel = await p.evaluate((el) => el.contains(document.activeElement));
      expect(inPanel, `Tab ${i + 1} landed in the closed panel`).toBe(false);
    }
  });

  for (const target of navLinks) {
    test(`reaches ${target.href} through the menu and marks it current`, async ({
      page,
      isMobile,
    }) => {
      await page.goto("/");
      await openByPointer(page, isMobile);
      await settle(page);
      await (await panel(page)).getByRole("link", { name: target.label }).click();
      await expect(page).toHaveURL(target.href);
      await openByPointer(page, isMobile);
      const current = (await panel(page)).getByRole("link", { name: target.label });
      await expect(current).toHaveAttribute("aria-current", "page");
      await expect((await panel(page)).locator('[aria-current="page"]')).toHaveCount(1);
    });
  }

  test("reduced motion: the panel appears and disappears instantly", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    // Opened by keyboard, focus still moves to the first link, even with no slide to wait for.
    await expect((await panel(page)).getByRole("link").first()).toBeFocused();
    // No slide, morph or stagger: every transition is effectively zero, with no delay.
    expect(await longestTransition(page)).toBeLessThanOrEqual(1);
    await expect
      .poll(() => placement(page))
      .toEqual({
        panelOffset: 0,
        labelOffset: 0,
        visibility: "visible",
      });

    await page.keyboard.press("Escape");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    expect(await longestTransition(page)).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await placement(page)).visibility).toBe("hidden");
  });

  test("has no serious accessibility violations closed or open", async ({ page, isMobile }) => {
    await page.goto("/");
    expect(await seriousViolations(page)).toEqual([]);
    await openByPointer(page, isMobile);
    await settle(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("the open panel is frosted glass: heavy backdrop blur, light tint, bright edge", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await openByPointer(page, isMobile);
    await settle(page);
    const s = await surface(page);
    // A thin tint lets the page show through; the blur has to be heavy to keep links readable.
    const blur = Number(s.backdropFilter.match(/blur\(([\d.]+)px\)/)?.[1]);
    expect(blur).toBeGreaterThanOrEqual(48);
    // Phones keep a thick tint (see MENU_GLASS); wider screens get the thin one.
    if (isMobile) expect(s.tint.a).toBeGreaterThan(0.65);
    else expect(s.tint.a).toBeLessThanOrEqual(0.4);
    expect(s.tint.a).toBeGreaterThan(0.25);
    expect(Math.min(s.tint.r, s.tint.g, s.tint.b)).toBeGreaterThanOrEqual(240);
    expect(s.edge).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(s.edgeWidth).toBe("2px");
  });

  for (const target of navLinks) {
    test(`over ${target.href}, every link reads at 4.5:1 against the pixels behind it`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(target.href);
      // Let the page's entrances (mascot, cards) finish so the whole page is behind the panel.
      // Looping animations (the title shimmer, idle sprites) never finish, so they're skipped.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
            .map((a) => a.finished.catch(() => {})),
        ),
      );
      await openByPointer(page, isMobile);
      await settle(page);
      const results = await linkContrastOverPage(page);
      const low = results.filter((r) => r.ratio < 4.5);
      expect(low, JSON.stringify(results, null, 1)).toEqual([]);
    });
  }

  test("reduced transparency: the panel is opaque, and turns to glass when the setting is off", async ({
    page,
    isMobile,
  }) => {
    await emulateReducedTransparency(page, "reduce");
    await page.goto("/");
    // The emulation reached the page, so the result below isn't a default.
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches),
    ).toBe(true);
    await openByPointer(page, isMobile);
    await settle(page);
    const opaque = await surface(page);
    expect(opaque.backdropFilter).toBe("none");
    expect(opaque.tint.a).toBe(1);
    expect(await seriousViolations(page)).toEqual([]);

    // The panel follows the setting live, without a reload.
    await emulateReducedTransparency(page, "no-preference");
    await settle(page);
    const glass = await surface(page);
    expect(glass.backdropFilter).toMatch(/blur\(\d/);
    expect(glass.tint.a).toBeLessThan(1);
  });

  test("without backdrop-filter support, the panel is opaque", async ({ page, isMobile }) => {
    await page.goto("/");
    // A browser without backdrop-filter skips every @supports block that tests for it. Chromium
    // supports it, so delete those blocks to get the same stylesheet such a browser would apply.
    const removed = await page.evaluate(() => {
      let count = 0;
      const prune = (list: CSSRuleList, remove: (i: number) => void) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const rule = list[i]!;
          if (rule instanceof CSSSupportsRule && rule.conditionText.includes("backdrop-filter")) {
            remove(i);
            count++;
          } else if (rule instanceof CSSGroupingRule || rule instanceof CSSStyleRule) {
            prune(rule.cssRules, (j) => rule.deleteRule(j));
          }
        }
      };
      for (const sheet of document.styleSheets) prune(sheet.cssRules, (i) => sheet.deleteRule(i));
      return count;
    });
    expect(removed).toBeGreaterThan(0);
    await openByPointer(page, isMobile);
    await settle(page);
    const s = await surface(page);
    expect(s.backdropFilter).toBe("none");
    expect(s.tint.a).toBe(1);
    expect(await seriousViolations(page)).toEqual([]);
  });

  for (const width of [320, 375]) {
    test(`no horizontal overflow at ${width}px, closed or open`, async ({ page, isMobile }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/portfolio");
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow()).toBe(0);
      await openByPointer(page, isMobile);
      await settle(page);
      expect(await overflow()).toBe(0);
      // Every label fits inside its mask instead of being clipped.
      const clipped = await (
        await panel(page)
      )
        .locator("[data-menu-label]")
        .evaluateAll(
          (labels) => labels.filter((l) => l.scrollWidth > l.parentElement!.clientWidth).length,
        );
      expect(clipped).toBe(0);
    });
  }
});
