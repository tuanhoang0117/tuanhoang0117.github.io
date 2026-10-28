import { expect, test } from "@playwright/test";

const moved = [
  { from: "/index.html", to: "/", h1: "Tuan Hoang" },
  { from: "/portfolio.html", to: "/portfolio", h1: "Portfolio" },
  { from: "/resume.html", to: "/resume", h1: "Resume" },
  { from: "/contact.html", to: "/contact", h1: "Contact" },
  { from: "/blog.html", to: "/", h1: "Tuan Hoang" },
];

// No static .html stubs: Pages and vite preview serve /portfolio from portfolio.html, so a stub
// there would redirect to itself forever. The SPA's client-side redirects handle these URLs.
test.describe("old v1 URLs", () => {
  for (const { from, to, h1 } of moved) {
    test(`${from} lands on ${to}`, async ({ page }) => {
      await page.goto(from);
      await page.waitForURL((url) => url.pathname === to);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    });
  }
});

test("robots.txt keeps crawlers out of /lab", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/^Disallow: \/lab$/m);
});
