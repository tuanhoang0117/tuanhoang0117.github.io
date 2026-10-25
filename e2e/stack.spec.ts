import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resume } from "../src/content/resume";

const total = resume.skills.reduce((n, g) => n + g.skills.length, 0);

const filterBar = (page: Page) => page.getByRole("group", { name: /filter skills/i });
const filter = (page: Page, label: string) =>
  filterBar(page).getByRole("button", { name: new RegExp(`^\\W*${escape(label)}`) });
const cards = (page: Page) =>
  page
    .getByRole("region", { name: /skills/i })
    .getByRole("list")
    .getByRole("listitem");
const pressed = (page: Page) => filterBar(page).locator('button[aria-pressed="true"]');

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help}`);
}

test.describe("/resume skills cards", () => {
  test("each filter shows exactly its group's cards and nothing else", async ({ page }) => {
    await page.goto("/resume");
    await expect(cards(page)).toHaveCount(total);
    await expect(pressed(page)).toHaveCount(1);
    await expect(pressed(page)).toHaveText(new RegExp(`^All\\s*${total}$`));

    for (const g of resume.skills) {
      await filter(page, g.label).click();
      await expect(pressed(page)).toHaveCount(1);
      await expect(pressed(page)).toContainText(g.label);
      await expect(pressed(page)).toContainText(String(g.skills.length));
      await expect(cards(page)).toHaveCount(g.skills.length);
      for (const [i, skill] of g.skills.entries()) {
        await expect(cards(page).nth(i)).toContainText(g.label);
        await expect(cards(page).nth(i)).toContainText(skill);
      }
      // Hidden cards are gone from the accessibility tree, not just invisible.
      const others = resume.skills.filter((o) => o !== g).flatMap((o) => o.skills);
      const tree = await page.getByRole("region", { name: /skills/i }).ariaSnapshot();
      const texts = tree.split("\n").map((l) => l.replace(/^\s*- \w+: /, "").replace(/"/g, ""));
      for (const s of g.skills) expect(texts).toContain(s);
      for (const s of others) expect(texts).not.toContain(s);
    }

    await filter(page, "All").click();
    await expect(cards(page)).toHaveCount(total);
  });

  test("the filter lives in the URL and survives a reload", async ({ page }) => {
    const frontend = resume.skills.find((g) => g.label === "Frontend")!;
    await page.goto("/resume");
    await filter(page, frontend.label).click();
    await expect(page).toHaveURL(/\/resume\?skills=frontend$/);

    await page.reload();
    await expect(pressed(page)).toContainText(frontend.label);
    await expect(cards(page)).toHaveCount(frontend.skills.length);

    await filter(page, "All").click();
    await expect(page).toHaveURL(/\/resume$/);
  });

  test("a shared link opens on its filter, and an unknown one falls back to All", async ({
    page,
  }) => {
    const frontend = resume.skills.find((g) => g.label === "Frontend")!;
    await page.goto("/resume?skills=frontend");
    await expect(pressed(page)).toContainText(frontend.label);
    await expect(cards(page)).toHaveCount(frontend.skills.length);

    await page.goto("/resume?skills=not-a-category");
    await expect(pressed(page)).toHaveText(new RegExp(`^All\\s*${total}$`));
    await expect(cards(page)).toHaveCount(total);
  });

  test("filters work from the keyboard with a visible focus ring", async ({ page }) => {
    await page.goto("/resume");
    const [first, second] = resume.skills;

    // Tab from the top of the page until the first group's filter has focus.
    const target = filter(page, first!.label);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(target).toBeFocused();
    const outline = await target.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    });
    expect(outline).toBe(true);

    await page.keyboard.press("Enter");
    await expect(target).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page)).toHaveCount(first!.skills.length);
    await expect(target).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(filter(page, second!.label)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(filter(page, second!.label)).toHaveAttribute("aria-pressed", "true");
    await expect(target).toHaveAttribute("aria-pressed", "false");
    await expect(cards(page)).toHaveCount(second!.skills.length);
  });

  test("has no serious accessibility violations, on All and filtered", async ({ page }) => {
    await page.goto("/resume");
    expect(await seriousViolations(page)).toEqual([]);
    await filter(page, resume.skills[0]!.label).click();
    await expect(cards(page)).toHaveCount(resume.skills[0]!.skills.length);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("lays the cards out in one short row, with no overflow in any state", async ({ page }) => {
    await page.goto("/resume");
    // Changed from the 2/5-column grid: one row, and about a third of the old ~160-175px height.
    const boxes = await cards(page).evaluateAll((lis) =>
      lis.map((li) => {
        const r = li.getBoundingClientRect();
        return { top: r.top + window.scrollY, height: r.height };
      }),
    );
    expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
    for (const b of boxes) expect(b.height).toBeLessThanOrEqual(64);

    expect(await overflow(page)).toBe(0);
    for (const g of resume.skills) {
      await filter(page, g.label).click();
      await expect(cards(page)).toHaveCount(g.skills.length);
      expect(await overflow(page), `overflow with ${g.label}`).toBe(0);
    }
  });

  test("cards have a hard ink border and a blur-free accent block shadow", async ({ page }) => {
    await page.goto("/resume");
    const styles = await cards(page).evaluateAll((lis) =>
      lis.slice(0, 3).map((el) => {
        const s = getComputedStyle(el);
        return {
          border: `${s.borderTopWidth} ${s.borderTopStyle}`,
          borderColor: s.borderTopColor,
          shadow: s.boxShadow,
        };
      }),
    );
    for (const s of styles) {
      expect(s.border).toBe("2px solid");
      expect(s.borderColor).toBe("rgb(20, 20, 20)");
      // Computed form is "<color> <x> <y> <blur> <spread>": a solid offset block has 0 blur.
      expect(s.shadow).toMatch(/ 3px 3px 0px 0px$/);
    }
    // The Resume theme cycles accent colors (not ink) across the cards.
    const colors = styles.map((s) =>
      s.shadow
        .split(", ")
        .at(-1)!
        .replace(/ 3px 3px 0px 0px$/, ""),
    );
    expect(new Set(colors).size).toBe(3);
    for (const c of colors) expect(c).not.toBe("rgb(20, 20, 20)");
  });

  test("cards lift on hover", async ({ page, isMobile }) => {
    test.skip(isMobile, "Touch devices have no hover");
    await page.goto("/resume");
    const card = cards(page).first();
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).translate)).not.toBe("none");
  });

  test("with reduced motion, cards don't move or animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/resume");
    const card = cards(page).first();
    await card.hover();
    const style = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { translate: s.translate, transition: s.transitionDuration };
    });
    expect(style.translate).toBe("none");
    expect(parseFloat(style.transition)).toBeLessThan(0.001);
  });
});

const scroller = (page: Page) => page.getByTestId("carousel");
const left = (page: Page) => scroller(page).evaluate((el) => el.scrollLeft);
const pauseButton = (page: Page) => page.getByRole("button", { name: /^(pause|play) scrolling$/i });

/** Waits until the row has moved from `from`, resolving to its new position. */
async function movedFrom(page: Page, from: number) {
  await expect.poll(() => left(page), { timeout: 5000 }).toBeGreaterThan(from + 8);
  return left(page);
}

/** Asserts the row holds still for a moment. */
async function holdsStill(page: Page) {
  const before = await left(page);
  await page.waitForTimeout(500);
  expect(await left(page)).toBe(before);
}

test.describe("/resume skills carousel", () => {
  test("Skills is the last section, after Education, Experience and Projects", async ({ page }) => {
    await page.goto("/resume");
    const headings = await page.locator("main h2").allTextContents();
    expect(headings.map((h) => h.replace(/^\d+ — /, ""))).toEqual([
      "Education",
      "Experience",
      "Projects",
      "Skills",
    ]);
  });

  test("glides on its own, pauses on hover and on the button, and resumes", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/resume");
    const start = await left(page);
    const moved = await movedFrom(page, start);
    await expect(scroller(page)).toHaveAttribute("data-moving", "true");

    if (!isMobile) {
      await scroller(page).hover();
      await expect(scroller(page)).toHaveAttribute("data-moving", "false");
      await holdsStill(page);
      await page.mouse.move(0, 0);
      await movedFrom(page, await left(page));
    }

    const button = pauseButton(page);
    await expect(button).toHaveAccessibleName("Pause scrolling");
    await button.click();
    await expect(button).toHaveAccessibleName("Play scrolling");
    await page.mouse.move(0, 0);
    await holdsStill(page);

    await button.click();
    await expect(button).toHaveAccessibleName("Pause scrolling");
    await movedFrom(page, await left(page));
    expect(moved).toBeGreaterThan(start);
  });

  test("the pause button works from the keyboard", async ({ page }) => {
    await page.goto("/resume");
    const button = pauseButton(page);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAccessibleName("Play scrolling");
    await holdsStill(page);
    await page.keyboard.press("Space");
    await expect(button).toHaveAccessibleName("Pause scrolling");
    await movedFrom(page, await left(page));
  });

  test("pauses while keyboard focus is on a card", async ({ page }) => {
    await page.goto("/resume");
    await cards(page).nth(2).focus();
    await expect(scroller(page)).toHaveAttribute("data-moving", "false");
    await holdsStill(page);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.mouse.move(0, 0);
    await expect(scroller(page)).toHaveAttribute("data-moving", "true");
  });

  test("loops without a gap: the copies line up and the row wraps back", async ({ page }) => {
    await page.goto("/resume");
    const m = await scroller(page).evaluate((el) => {
      const lists = el.querySelectorAll("ul");
      const first = lists[0]!;
      const copy = lists[1]!;
      return {
        period: first.getBoundingClientRect().width,
        offset:
          copy.firstElementChild!.getBoundingClientRect().left -
          first.firstElementChild!.getBoundingClientRect().left,
        viewport: el.clientWidth,
        scrollWidth: el.scrollWidth,
      };
    });
    // The second list starts exactly one list-width after the first, so the wrap is invisible.
    expect(Math.abs(m.offset - m.period)).toBeLessThan(1);
    // And there is always content to the right of the viewport, even at the wrap point.
    expect(m.scrollWidth).toBeGreaterThanOrEqual(m.period + m.viewport);

    await scroller(page).evaluate((el, to) => (el.scrollLeft = to), m.period - 20);
    await expect.poll(() => left(page), { timeout: 5000 }).toBeLessThan(m.period / 2);
  });

  test("the loop stays seamless under a short filter group", async ({ page }) => {
    await page.goto("/resume?skills=tools");
    const m = await scroller(page).evaluate((el) => ({
      period: el.querySelector("ul")!.getBoundingClientRect().width,
      scrollWidth: el.scrollWidth,
      viewport: el.clientWidth,
    }));
    expect(m.scrollWidth).toBeGreaterThanOrEqual(m.period + m.viewport);
  });

  test("duplicates are hidden from screen readers and every skill is keyboard reachable", async ({
    page,
  }) => {
    await page.goto("/resume");
    // Each skill appears once in the accessibility tree.
    const tree = await page.getByRole("region", { name: /skills/i }).ariaSnapshot();
    for (const g of resume.skills) {
      for (const s of g.skills) {
        const hits = tree.split("\n").filter((l) => l.includes(`"${s}"`) || l.endsWith(`: ${s}`));
        expect(hits, s).toHaveLength(1);
      }
    }
    expect(await scroller(page).locator("ul[aria-hidden='true'] [tabindex]").count()).toBe(0);

    // Press Tab from the pause button and collect each card that takes focus.
    await pauseButton(page).focus();
    const seen: string[] = [];
    for (let i = 0; i < total + 2; i++) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(
          () =>
            (document.activeElement?.tagName === "LI" ? document.activeElement.textContent : "") ??
            "",
        ),
      );
    }
    for (const g of resume.skills) {
      for (const s of g.skills)
        expect(
          seen.some((t) => t.includes(s)),
          s,
        ).toBe(true);
    }
  });

  test("a filter changes which cards are in the row, and the row keeps moving", async ({
    page,
  }) => {
    await page.goto("/resume");
    const tools = resume.skills.find((g) => g.label === "Tools")!;
    await filter(page, tools.label).click();
    await expect(cards(page)).toHaveCount(tools.skills.length);
    await expect(scroller(page).locator("ul[aria-hidden='true']").first()).toBeAttached();
    await movedFrom(page, await left(page));
  });

  test("reduced motion: a static strip you can scroll, with no copies and no pause button", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/resume");
    await expect(scroller(page)).toHaveAttribute("data-moving", "false");
    await page.waitForTimeout(600);
    expect(await left(page)).toBe(0);
    await expect(pauseButton(page)).toHaveCount(0);
    expect(await scroller(page).locator("ul").count()).toBe(1);
    await expect(cards(page)).toHaveCount(total);

    const { overflowX, scrollable } = await scroller(page).evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollable: el.scrollWidth > el.clientWidth,
    }));
    expect(overflowX).toBe("auto");
    expect(scrollable).toBe(true);
    await scroller(page).evaluate((el) => (el.scrollLeft = 200));
    expect(await left(page)).toBeGreaterThan(100);
    await page.waitForTimeout(300);
    expect(await left(page)).toBe(200);
  });
});
