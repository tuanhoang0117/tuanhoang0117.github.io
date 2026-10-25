import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  alphaBlend,
  checkContrast,
  contrastRatio,
  contrastThreshold,
  parseColor,
} from "./checkContrast";

test.describe("graph-paper contrast helper math", () => {
  test("calculates WCAG contrast ratios", () => {
    expect(contrastRatio(parseColor("rgb(0, 0, 0)"), parseColor("rgb(255, 255, 255)"))).toBeCloseTo(
      21,
    );
  });

  test("blends alpha colors over their background", () => {
    expect(alphaBlend(parseColor("rgba(0, 0, 0, 0.5)"), parseColor("rgb(255, 255, 255)"))).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 1,
    });
  });

  test("uses the large-text AA threshold for 24px text or bold 18.66px text", () => {
    expect(contrastThreshold(24, 400)).toBe(3);
    expect(contrastThreshold(18.66, 700)).toBe(3);
    expect(contrastThreshold(18.66, 600)).toBe(4.5);
  });
});

test("flags low-contrast text on graph paper that axe leaves incomplete", async ({ page }) => {
  await page.goto("/");
  await page
    .locator(".prompt")
    .evaluate((element) => element.setAttribute("style", "color: #e4e3d3"));

  const axeResults = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const { incomplete } = axeResults;
  expect(
    incomplete.some((rule) => rule.nodes.some((node) => node.target.includes(".prompt"))),
  ).toBe(true);
  expect(
    axeResults.violations.some((rule) =>
      rule.nodes.some((node) => node.target.includes(".prompt")),
    ),
  ).toBe(false);
  await expect(checkContrast(page)).rejects.toThrow(/\.prompt/);
});
