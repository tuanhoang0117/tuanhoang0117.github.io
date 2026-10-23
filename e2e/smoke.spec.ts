import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", h1: "Tuan Hoang" },
  { path: "/portfolio", h1: "Portfolio" },
  { path: "/resume", h1: "Resume" },
  { path: "/contact", h1: "Contact" },
];

for (const { path, h1 } of routes) {
  test.describe(`${path}`, () => {
    test("renders its heading inside the shell", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
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
  });
}

test("unknown routes show the 404 page", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
});

test("v1 .html URLs redirect to their v2 routes", async ({ page }) => {
  await page.goto("/portfolio.html");
  await expect(page).toHaveURL("/portfolio");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portfolio");
});

test("nav moves between pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Resume" }).click();
  await expect(page).toHaveURL("/resume");
  await expect(page.getByRole("link", { name: "Resume" })).toHaveAttribute("aria-current", "page");
});
