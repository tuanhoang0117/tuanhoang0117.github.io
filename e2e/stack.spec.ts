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

  test("lays out 2 columns at 375px and 5 on desktop, with no overflow in any state", async ({
    page,
  }, testInfo) => {
    await page.goto("/resume");
    const columns = await page
      .getByRole("region", { name: /skills/i })
      .getByRole("list")
      .evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(testInfo.project.name === "mobile" ? 2 : 5);

    expect(await overflow(page)).toBe(0);
    for (const g of resume.skills) {
      await filter(page, g.label).click();
      await expect(cards(page)).toHaveCount(g.skills.length);
      expect(await overflow(page), `overflow with ${g.label}`).toBe(0);
    }
  });

  test("cards have a hard ink border and a blur-free block shadow", async ({ page }) => {
    await page.goto("/resume");
    const style = await cards(page)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { border: `${s.borderTopWidth} ${s.borderTopStyle}`, shadow: s.boxShadow };
      });
    expect(style.border).toBe("2px solid");
    // Computed form is "<color> <x> <y> <blur> <spread>": a solid offset block has 0 blur.
    expect(style.shadow).toMatch(/ 6px 6px 0px 0px$/);
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
