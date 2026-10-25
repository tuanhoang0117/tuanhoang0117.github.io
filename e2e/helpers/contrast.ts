import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { colorOrThrow, judgeNode, type ContrastFailure } from "./contrast-judge";
import { readNodeFacts } from "./contrast-page";

export { formatFailure, type ContrastFailure } from "./contrast-judge";

/**
 * axe-core can't check text on graph paper: `bg-graph` paints gradients, so axe reports every
 * text node there as *incomplete* ("background color could not be determined") instead of pass
 * or fail. This helper takes those nodes and checks them itself, against the nearest solid
 * background color, or the `paper` token when there is none. It does not replace axe: axe still
 * checks everything it can decide.
 */

export interface ContrastResult {
  /** Visible nodes axe reported as incomplete, which this helper then checked. */
  checked: number;
  /** Incomplete nodes that were invisible and so skipped. */
  skipped: number;
  /**
   * Incomplete nodes whose glyphs are painted by a clipped background (`bg-clip-text`) instead of
   * `color`. Their color is a gradient, so a single ratio would be meaningless; they are listed
   * so a person can look at them instead of the helper silently passing them.
   */
  gradientText: string[];
  failures: ContrastFailure[];
}

/**
 * Checks the contrast of every text node axe couldn't decide on the current page. Call it after
 * the page has loaded and settled. Returns the failures instead of asserting, so callers choose
 * how to report them.
 */
export async function checkContrast(page: Page): Promise<ContrastResult> {
  const { incomplete } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const selectors: string[] = [];
  for (const rule of incomplete) {
    for (const node of rule.nodes) {
      const target = node.target[0];
      // Targets inside iframes or shadow roots are nested arrays. This site has neither, so fail
      // loudly if one appears rather than skipping it.
      if (typeof target !== "string" || node.target.length !== 1) {
        throw new Error(`Unsupported axe target: ${JSON.stringify(node.target)}`);
      }
      selectors.push(target);
    }
  }
  const result: ContrastResult = { checked: 0, skipped: 0, gradientText: [], failures: [] };
  if (selectors.length === 0) return result;

  const { paper, nodes } = await page.evaluate(readNodeFacts, selectors);
  const paperColor = colorOrThrow(paper, "the paper token", "(page)");

  for (const facts of nodes) {
    const verdict = judgeNode(facts, paperColor);
    if (verdict.kind === "invisible") result.skipped++;
    else if (verdict.kind === "gradient") result.gradientText.push(facts.selector);
    else {
      result.checked++;
      if (verdict.kind === "fail") result.failures.push(verdict.failure);
    }
  }
  return result;
}
