import { expect, test } from "@playwright/test";
import { colorOrThrow, formatFailure, judgeNode } from "./contrast-judge";
import type { NodeFacts } from "./contrast-page";
import { parseCssColor, type Rgba } from "./contrast-math";

// Self-test for the per-node decision. It uses hand-built facts, because axe never reports an
// invisible node as incomplete and decides text on a solid color itself, so a live page can't
// reach those paths. Real colors from the design tokens: paper #fbf8f1, ink #141414,
// ink-faint #8a8a84, poly (Poly Green) a dark green.

const PAPER = parseCssColor("rgb(251, 248, 241)") as Rgba;

function facts(overrides: Partial<NodeFacts> = {}): NodeFacts {
  return {
    selector: "p.sample",
    visible: true,
    text: "Sample",
    color: "rgb(20, 20, 20)",
    strokeColor: "rgb(0, 0, 0)",
    strokeWidth: 0,
    fontSize: 16,
    fontWeight: 400,
    clipsBackgroundToText: false,
    opacity: 1,
    backgrounds: [],
    ...overrides,
  };
}

test.describe("judging one text node", () => {
  test("dark text on paper passes", () => {
    const verdict = judgeNode(facts(), PAPER);
    expect(verdict.kind).toBe("pass");
  });

  test("pale text on paper fails, and the failure names the node, colors and ratio", () => {
    const verdict = judgeNode(facts({ color: "rgb(138, 138, 132)" }), PAPER);
    expect(verdict.kind).toBe("fail");
    if (verdict.kind !== "fail") return;
    expect(verdict.failure.selector).toBe("p.sample");
    expect(verdict.failure.textColor).toBe("#8a8a84");
    expect(verdict.failure.backgroundColor).toBe("#fbf8f1");
    expect(verdict.failure.required).toBe(4.5);
    expect(verdict.failure.ratio).toBeGreaterThan(3);
    expect(verdict.failure.ratio).toBeLessThan(4.5);
    expect(formatFailure(verdict.failure)).toMatch(
      /^p\.sample "Sample": #8a8a84 on #fbf8f1 = 3\.\d\d:1, needs 4\.5:1 \(16px, weight 400\)$/,
    );
  });

  test("invisible nodes are skipped, whatever their colors", () => {
    const verdict = judgeNode(facts({ visible: false, color: "rgb(251, 248, 241)" }), PAPER);
    expect(verdict).toEqual({ kind: "invisible" });
  });

  test("text painted by a clipped gradient is flagged for a person, not given a ratio", () => {
    const verdict = judgeNode(
      facts({ clipsBackgroundToText: true, color: "rgba(0, 0, 0, 0)" }),
      PAPER,
    );
    expect(verdict).toEqual({ kind: "gradient" });
  });

  test("a solid background behind the text replaces the paper", () => {
    // Paper-colored text: invisible on paper (1:1), but readable on a dark green card.
    const onPaper = judgeNode(facts({ color: "rgb(251, 248, 241)" }), PAPER);
    expect(onPaper.kind).toBe("fail");
    const onGreen = judgeNode(
      facts({ color: "rgb(251, 248, 241)", backgrounds: ["rgb(21, 71, 52)"] }),
      PAPER,
    );
    expect(onGreen.kind).toBe("pass");
  });

  test("the nearest opaque background wins over ones behind it", () => {
    const verdict = judgeNode(
      facts({
        color: "rgb(251, 248, 241)",
        backgrounds: ["rgb(21, 71, 52)", "rgb(255, 255, 255)"],
      }),
      PAPER,
    );
    expect(verdict.kind).toBe("pass");
  });

  test("a semi-transparent text color is blended, so 30% ink fails", () => {
    const verdict = judgeNode(facts({ color: "rgba(20, 20, 20, 0.3)" }), PAPER);
    expect(verdict.kind).toBe("fail");
    if (verdict.kind === "fail") expect(verdict.failure.textColor).not.toBe("#141414");
  });

  test("opacity on the element chain lightens the text the same way", () => {
    expect(judgeNode(facts({ opacity: 0.3 }), PAPER).kind).toBe("fail");
    expect(judgeNode(facts({ opacity: 1 }), PAPER).kind).toBe("pass");
  });

  test("large text only needs 3:1: a mid gray fails at 16px and passes at 32px", () => {
    const gray = { color: "rgb(138, 138, 132)" };
    expect(judgeNode(facts({ ...gray, fontSize: 16 }), PAPER).kind).toBe("fail");
    expect(judgeNode(facts({ ...gray, fontSize: 32 }), PAPER).kind).toBe("pass");
    // Bold counts as large from 18.66px.
    expect(judgeNode(facts({ ...gray, fontSize: 19, fontWeight: 700 }), PAPER).kind).toBe("pass");
    expect(judgeNode(facts({ ...gray, fontSize: 19, fontWeight: 400 }), PAPER).kind).toBe("fail");
  });

  test("hollow display text is judged by its stroke, since its fill is transparent", () => {
    const hollow = {
      color: "rgba(0, 0, 0, 0)",
      strokeWidth: 2,
      fontSize: 60,
    };
    expect(judgeNode(facts({ ...hollow, strokeColor: "rgb(20, 20, 20)" }), PAPER).kind).toBe(
      "pass",
    );
    expect(judgeNode(facts({ ...hollow, strokeColor: "rgb(251, 248, 241)" }), PAPER).kind).toBe(
      "fail",
    );
    // No stroke at all means no visible glyphs to judge by color: transparent on paper fails.
    expect(judgeNode(facts({ ...hollow, strokeWidth: 0 }), PAPER).kind).toBe("fail");
  });

  test("a color it can't read throws instead of passing", () => {
    expect(() => judgeNode(facts({ color: "oklch(0.5 0.1 200)" }), PAPER)).toThrow(/Can't read/);
    expect(() => colorOrThrow("nonsense", "a text color", "p")).toThrow(/Can't read a text color/);
  });
});
