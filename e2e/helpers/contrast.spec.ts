import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { checkContrast, formatFailure } from "./contrast";

// Proves the helper catches what axe can't. Each test loads a real graph-paper page, adds one text
// node at runtime (so no page file is touched), and checks both tools. The nodes use the real
// tokens through inline styles, the way a page would.

const PAGE = "/contact";

async function addText(page: Page, style: string, text = "Injected sample text") {
  await page.evaluate(
    ({ style, text }) => {
      const el = document.createElement("p");
      el.id = "injected-contrast-sample";
      el.setAttribute("style", style);
      el.textContent = text;
      document.querySelector("main")!.prepend(el);
    },
    { style, text },
  );
}

const axeSerious = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
};

test.describe("contrast helper on a graph-paper page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);
  });

  test("the page as shipped has nothing for the helper to flag, and axe leaves nodes undecided", async ({
    page,
  }) => {
    const result = await checkContrast(page);
    // If axe ever decides these nodes itself, this test should be revisited rather than quietly
    // passing with nothing checked.
    expect(result.checked).toBeGreaterThan(0);
    expect(result.failures.map(formatFailure)).toEqual([]);
  });

  test("pale text on graph paper: axe passes it, the helper fails it", async ({ page }) => {
    await addText(page, "color: var(--color-ink-faint); font-size: 16px;");
    // axe is silent: it can't tell what the gradient background is.
    expect((await axeSerious(page)).map((v) => v.id)).toEqual([]);
    const { failures } = await checkContrast(page);
    const hit = failures.find((f) => f.selector.includes("injected-contrast-sample"));
    expect(hit, "the injected node should fail").toBeDefined();
    // --color-ink-faint (#8a8a84) on --color-paper (#fbf8f1) is about 3.2:1.
    expect(hit!.ratio).toBeGreaterThan(2.5);
    expect(hit!.ratio).toBeLessThan(4.5);
    expect(hit!.required).toBe(4.5);
    expect(hit!.textColor).toBe("#8a8a84");
    expect(hit!.backgroundColor).toBe("#fbf8f1");
    expect(formatFailure(hit!)).toContain("#injected-contrast-sample");
  });

  test("the same color passes as large text, which only needs 3:1", async ({ page }) => {
    await addText(page, "color: var(--color-ink-faint); font-size: 32px;");
    const { failures } = await checkContrast(page);
    expect(failures.filter((f) => f.selector.includes("injected-contrast-sample"))).toEqual([]);
  });

  test("dark text on graph paper passes", async ({ page }) => {
    await addText(page, "color: var(--color-ink); font-size: 16px;");
    const { failures } = await checkContrast(page);
    expect(failures.filter((f) => f.selector.includes("injected-contrast-sample"))).toEqual([]);
  });

  test("semi-transparent text is blended before it is judged", async ({ page }) => {
    // Solid ink passes, but at 30% alpha it reads as pale gray on paper.
    await addText(page, "color: rgb(20 20 20 / 0.3); font-size: 16px;");
    const { failures } = await checkContrast(page);
    const hit = failures.find((f) => f.selector.includes("injected-contrast-sample"));
    expect(hit, "30% ink on paper should fail").toBeDefined();
    expect(hit!.textColor).not.toBe("#141414");
  });

  test("opacity on the element counts the same as alpha on the color", async ({ page }) => {
    await addText(page, "color: var(--color-ink); opacity: 0.3; font-size: 16px;");
    const { failures } = await checkContrast(page);
    expect(failures.some((f) => f.selector.includes("injected-contrast-sample"))).toBe(true);
  });

  // Invisible text, solid backgrounds, and gradient text can't be built on a live page: axe never
  // reports hidden nodes as incomplete and decides text on a solid color itself. Those paths are
  // covered with hand-built facts in contrast-judge.spec.ts.
});
