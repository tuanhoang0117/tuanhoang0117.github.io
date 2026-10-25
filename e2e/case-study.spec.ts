import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { projects } from "../src/content/projects";
import { checkContrast } from "./helpers/checkContrast";

const SLUG = "tar-syndrome-website";
const project = projects.find((p) => p.slug === SLUG)!;
const study = project.caseStudy!;
const path = `/portfolio/${SLUG}`;
const LIVE_SITE = "https://tar-syndrome-awareness.square.site/";

const sections = (page: Page) => page.locator("main [data-section]");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Waits until every finite entrance has finished (the banner scrolls forever, so it's ignored). */
async function settleEntrances(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
        ),
      { timeout: 3000 },
    )
    .toBe(0);
}

test.describe(path, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(path);
  });

  test("renders the case study from content: overview, problem, process, role, results", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(project.title);
    await expect(page).toHaveTitle(new RegExp(`^${escape(project.title)}`));
    const main = page.getByRole("main");
    await expect(main.getByText(study.overview)).toBeVisible();
    await expect(main.getByText(study.problem)).toBeVisible();
    for (const step of study.process) {
      await expect(main.getByRole("heading", { level: 3, name: step.title })).toBeVisible();
    }
    for (const r of [...study.role, ...study.results]) {
      await expect(main.getByText(r, { exact: true })).toBeVisible();
    }
    await expect(sections(page)).toHaveCount(6);
  });

  test("the live-site link points at the live site and opens in a new tab", async ({ page }) => {
    expect(project.links.map((l) => l.href)).toContain(LIVE_SITE);
    const live = page.getByRole("link", { name: /opens in a new tab/ });
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute("href", LIVE_SITE);
    await expect(live).toHaveAttribute("target", "_blank");
  });

  test("the PDF link is a download that returns a PDF", async ({ page, request }) => {
    const link = page.getByRole("link", { name: new RegExp(`^${escape(study.pdf!.label)}`) });
    await expect(link).toHaveAttribute("download");
    await expect(link).toHaveAccessibleName(/downloads a file/);
    const href = await link.getAttribute("href");
    expect(href).toBe(study.pdf!.href);
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect((await res.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("section cards carry hard borders and distinct accent block shadows", async ({ page }) => {
    await settleEntrances(page);
    const styles = await sections(page).evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, border: s.borderTopWidth };
      }),
    );
    expect(styles).toHaveLength(6);
    for (const s of styles) {
      expect(s.border).toBe("2px");
      // Tailwind prepends transparent ring layers; judge only the visible ones.
      const visible = s.shadow
        .split(/,(?![^(]*\))/)
        .map((layer) => layer.trim())
        .filter((layer) => !layer.startsWith("rgba(0, 0, 0, 0)"));
      expect(visible, s.shadow).toHaveLength(1);
      const [x, y, blur] = [...visible[0]!.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
      // A hard block: offset down and right, never blurred.
      expect(x, s.shadow).toBeGreaterThan(0);
      expect(y, s.shadow).toBeGreaterThan(0);
      expect(blur, s.shadow).toBe(0);
    }
    expect(new Set(styles.map((s) => s.shadow)).size).toBeGreaterThan(1);
  });

  test("has no serious accessibility violations once the cards have entered", async ({ page }) => {
    await settleEntrances(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await checkContrast(page);
  });

  test("has no horizontal overflow", async ({ page }) => {
    await settleEntrances(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("under reduced motion, every section is in place with no entrance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    expect(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
      ),
    ).toBe(0);
    for (const s of await sections(page).all()) {
      await expect(s).toBeVisible();
      await expect(s).toHaveCSS("transform", "none");
      await expect(s).toHaveCSS("translate", "none");
      await expect(s).toHaveCSS("clip-path", "none");
    }
  });

  test("no ancestor of the page content creates a containing block for fixed elements", async ({
    page,
  }) => {
    await settleEntrances(page);
    const offenders = await page.evaluate(() => {
      // Tailwind v4's translate/rotate/scale utilities set their own properties, not `transform`.
      const props = ["transform", "translate", "rotate", "scale", "filter", "perspective"];
      const bad: string[] = [];
      // From the Stagger list itself (it animates only its children) up to the root.
      for (let el = document.querySelector("main [data-stagger]"); el; el = el.parentElement) {
        const s = getComputedStyle(el);
        for (const p of props) {
          const v = s.getPropertyValue(p);
          if (v && v !== "none") bad.push(`${el.tagName}: ${p} ${v}`);
        }
        if (/transform|filter|perspective/.test(s.willChange))
          bad.push(`${el.tagName}: will-change`);
        if (/paint|layout|strict|content/.test(s.contain)) bad.push(`${el.tagName}: contain`);
      }
      return bad;
    });
    expect(offenders).toEqual([]);
  });
});

test("unknown project slugs show the site's not-found page", async ({ page }) => {
  await page.goto("/portfolio/tar-syndrome");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
  await expect(page.locator("main [data-section]")).toHaveCount(0);
});
