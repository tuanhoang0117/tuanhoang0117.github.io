import { expect, test, type Page } from "@playwright/test";

// Every page whose title comes from PageHeader.
const routes = [
  { path: "/portfolio", h1: "Portfolio" },
  { path: "/resume", h1: "Resume" },
  { path: "/lab", h1: "Pixel Lab" },
  { path: "/portfolio/remind-app", h1: "Remind App" },
  { path: "/no-such-page", h1: "404" },
];

const shimmerOf = (page: Page) => page.locator("header [data-shimmer]");

for (const { path, h1 } of routes) {
  test.describe(path, () => {
    test("the title shimmers: an aria-hidden copy laid exactly over a plain heading", async ({
      page,
    }) => {
      await page.goto(path);
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveText(h1);
      await expect(heading).toHaveAccessibleName(h1);

      const shimmer = shimmerOf(page);
      await expect(shimmer).toHaveCount(1);
      await expect(shimmer).toHaveAttribute("aria-hidden", "true");
      await expect(shimmer).toHaveText(h1);

      const [h, s] = [(await heading.boundingBox())!, (await shimmer.boundingBox())!];
      expect(Math.abs(s.x - h.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.y - h.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.width - h.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.height - h.height)).toBeLessThanOrEqual(1);

      const look = await shimmer.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          image: cs.backgroundImage,
          clip: cs.backgroundClip || cs.webkitBackgroundClip,
          color: cs.color,
          running: el.getAnimations().filter((a) => a.playState === "running").length,
        };
      });
      expect(look.image).toMatch(/^linear-gradient\(/);
      expect(look.clip).toBe("text");
      expect(look.color).toBe("rgba(0, 0, 0, 0)");
      expect(look.running).toBe(1);
    });

    test("under reduced motion the shimmer is drawn but static", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      const shimmer = shimmerOf(page);
      await expect(shimmer).toHaveText(h1);
      expect(await shimmer.evaluate((el) => el.getAnimations().length)).toBe(0);
    });
  });
}
