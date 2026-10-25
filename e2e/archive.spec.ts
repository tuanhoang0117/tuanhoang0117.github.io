import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Expected values from src/content/hackathons.ts, newest first, written out because the e2e
// tsconfig (nodenext) can't import src/content without file extensions. If the data changes,
// update these too.
const expected = [
  { slug: "oculusmd", project: "oculusMD", date: "MAY 2026", placed: false },
  { slug: "ace", project: "ACE", date: "MAR 2026", placed: false },
  { slug: "zip", project: "ZIP", date: "FEB 2026", placed: false },
  { slug: "vibemate", project: "VibeMate", date: "DEC 2025", placed: true },
];

const columns = (page: Page) => page.getByRole("main").getByRole("article");

/** Number of distinct column x positions in the first row, i.e. how many columns the grid has. */
async function columnCount(page: Page): Promise<number> {
  const lefts = await columns(page).evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().left)),
  );
  return new Set(lefts).size;
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("/hackathons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/hackathons");
  });

  test("shows one column per hackathon, newest first, with date and numbered strip", async ({
    page,
  }) => {
    await expect(columns(page)).toHaveCount(expected.length);
    for (const [i, h] of expected.entries()) {
      const column = columns(page).nth(i);
      await expect(column.getByRole("heading", { level: 2 })).toHaveText(h.project);
      await expect(column.getByText(h.date, { exact: true })).toBeVisible();
      const strip = `${String(i + 1).padStart(2, "0")} ${h.project.toUpperCase()}`;
      await expect(column.getByText(strip, { exact: true })).toBeVisible();
      await expect(column).not.toContainText(/undefined|NaN/);
    }
  });

  test("each Open event link reaches its detail page", async ({ page }) => {
    for (const h of expected) {
      await page.goto("/hackathons");
      await page.getByRole("link", { name: `Open event: ${h.project}` }).click();
      await expect(page).toHaveURL(`/hackathons/${h.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h.project);
    }
  });

  test("the winner sticker appears only on placed events", async ({ page }) => {
    for (const [i, h] of expected.entries()) {
      const sticker = columns(page).nth(i).getByTestId("winner-sticker");
      if (h.placed) await expect(sticker).toBeVisible();
      else await expect(sticker).toHaveCount(0);
    }
    await expect(page.getByTestId("winner-sticker")).toHaveCount(
      expected.filter((h) => h.placed).length,
    );
  });

  test("has no serious accessibility violations", async ({ page }) => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("fills the row at 1280px: every column sits in one row, none orphaned below", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(columns(page)).toHaveCount(expected.length);
    const tops = await columns(page).evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(1);
  });

  test("columns carry accent block shadows, each a different color", async ({ page }) => {
    const shadows = await columns(page).evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).boxShadow),
    );
    for (const s of shadows) expect(s).not.toBe("none");
    expect(new Set(shadows).size).toBe(expected.length);
  });

  // 375px is the width docs/design-system.md promises; 800px is a tablet; 1280px is desktop.
  for (const { width, cols } of [
    { width: 375, cols: 1 },
    { width: 800, cols: 2 },
    { width: 1280, cols: 4 },
  ]) {
    test(`lays out ${cols} column(s) at ${width}px with no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect(columns(page)).toHaveCount(expected.length);
      expect(await columnCount(page)).toBe(cols);
      expect(await overflow(page)).toBe(0);
    });
  }
});
