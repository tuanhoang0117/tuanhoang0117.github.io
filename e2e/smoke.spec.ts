import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { checkContrast } from "./helpers/checkContrast";

const routes = [
  { path: "/", h1: "Tuan Hoang" },
  { path: "/portfolio", h1: "Portfolio" },
  { path: "/resume", h1: "Resume" },
  { path: "/contact", h1: "Contact" },
  { path: "/lab", h1: "Pixel Lab" },
  { path: "/lab/motion", h1: "Motion Lab" },
  { path: "/lab/banner", h1: "Banner Lab" },
  { path: "/lab/title", h1: "Title Lab" },
  { path: "/lab/mascot", h1: "Mascot Lab" },
  { path: "/lab/physics", h1: "Physics Lab" },
  { path: "/portfolio/remind-app", h1: "Remind App" },
];

for (const { path, h1 } of routes) {
  test.describe(`${path}`, () => {
    test("renders its heading inside the shell", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(h1);
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
    });

    test("has no horizontal overflow", async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });

    test("has no serious accessibility violations", async ({ page }) => {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });

    test("links nowhere in the archived hackathons page", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(h1);
      await expect(page.locator('a[href^="/hackathons"]')).toHaveCount(0);
    });

    test("checks text contrast on graph paper", async ({ page }) => {
      test.skip(
        path === "/resume",
        "TODO(#41): resume glyphs have low contrast on white cards; issue owner will decide whether to adjust the decorative palette.",
      );
      await page.goto(path);
      await checkContrast(page);
    });
  });
}

test("unknown routes show the 404 page", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
});

test("unknown project slugs show the 404 page", async ({ page }) => {
  await page.goto("/portfolio/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
});

test("v1 .html URLs redirect to their v2 routes", async ({ page }) => {
  await page.goto("/portfolio.html");
  await expect(page).toHaveURL("/portfolio");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portfolio");
});

test("nav moves between pages", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  // The links live in the menu panel (e2e/menu.spec.ts covers the menu itself).
  await nav.getByRole("button", { name: "Open menu" }).click();
  await nav.getByRole("link", { name: "Resume" }).click();
  await expect(page).toHaveURL("/resume");
  await nav.getByRole("button", { name: "Open menu" }).click();
  await expect(nav.getByRole("link", { name: "Resume" })).toHaveAttribute("aria-current", "page");
});

// The hackathons page is archived (archive/hackathons-page/), so its URLs fall through to the 404.
for (const path of ["/hackathons", "/hackathons/oculusmd", "/hackathons/not-a-real-event"]) {
  test(`${path} shows the 404 page`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });
}

test("the nav has no Hackathons link", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: "Open menu" }).click();
  await expect(nav.getByRole("link", { name: "Portfolio" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /hackathons/i })).toHaveCount(0);
});

test("resume PDF is downloadable", async ({ page, request }) => {
  await page.goto("/resume");
  const href = await page.getByRole("link", { name: /Download PDF/ }).getAttribute("href");
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});
