import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { navLinks } from "../src/content/site";

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
