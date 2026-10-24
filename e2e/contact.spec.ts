import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Expected values from src/content/site.ts, written out because the e2e tsconfig (nodenext) can't
// import src/content without file extensions. If site.ts changes, update these too.
const email = "tuanhoang0117@gmail.com";
const socials = [
  { label: "Email", href: `mailto:${email}` },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/tuanhoang0117/" },
  { label: "GitHub", href: "https://github.com/tuanhoang0117" },
];

const card = (page: Page) => page.getByRole("main").locator("ul").getByRole("link");

test.describe("/contact", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
  });

  test("contact links point at the right addresses, Email then LinkedIn then GitHub", async ({
    page,
  }) => {
    const links = card(page);
    await expect(links).toHaveCount(socials.length);
    for (const [i, s] of socials.entries()) {
      await expect(links.nth(i)).toHaveAccessibleName(new RegExp(`^${s.label}`));
      await expect(links.nth(i)).toHaveAttribute("href", s.href);
    }
    await expect(page.getByRole("main").getByRole("link", { name: /resume/i })).toHaveAttribute(
      "href",
      "/resume",
    );
  });

  test("Copy email puts the address on the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.getByRole("button", { name: "Copy email" }).click();

    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(/copied/i);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(email);
    await expect(page.getByRole("button", { name: "Copy email" })).toBeVisible({ timeout: 4000 });
  });

  test("shows the address when the clipboard fails", async ({ page }) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    });

    await page.getByRole("button", { name: "Copy email" }).click();

    await expect(page.getByRole("button", { name: /couldn't copy/i })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  });

  test("a keyboard-only pass reaches every card control with a visible focus ring", async ({
    page,
  }) => {
    const expected = (await page.locator("main").locator("a, button").allTextContents()).map((t) =>
      t.trim(),
    );
    expect(expected).toHaveLength(socials.length + 2);
    expect(expected[0]).toBe("Copy email");

    // Tab from the top of the page until focus leaves the contact section.
    const reached: string[] = [];
    for (let i = 0; i < 30 && reached.length < expected.length; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest("main")) return null;
        const style = getComputedStyle(el);
        return {
          text: el.textContent!.trim(),
          outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
        };
      });
      if (!info) continue;
      expect(info.outline, `focus ring on "${info.text}"`).toBe(true);
      reached.push(info.text);
    }

    expect(reached).toEqual(expected);
  });

  test("has no serious accessibility violations, idle and after a failed copy", async ({
    page,
  }) => {
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      return violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.help}`);
    };
    expect(await scan()).toEqual([]);

    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    });
    await page.getByRole("button", { name: "Copy email" }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    expect(await scan()).toEqual([]);
  });

  test("has no horizontal overflow, even with the fallback address shown", async ({ page }) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    });
    await page.getByRole("button", { name: "Copy email" }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
