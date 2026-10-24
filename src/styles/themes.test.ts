/// <reference types="node" />
// Vitest runs in Node, and the test config blanks CSS imports (css: false), so read the
// stylesheet from disk. Vitest's working directory is the repo root.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardShadow, pageThemes } from "./themes";

const css = readFileSync("src/styles/index.css", "utf8");

/** Every `--color-*` token in index.css, with `var(--color-x)` references resolved to hex. */
function colorTokens(): Map<string, string> {
  const raw = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--color-([a-z-]+):\s*([^;]+);/g)) {
    raw.set(name!, value!.trim());
  }
  const resolve = (name: string, seen = new Set<string>()): string => {
    const value = raw.get(name);
    if (value === undefined) throw new Error(`no --color-${name}`);
    const ref = /^var\(--color-([a-z-]+)\)$/.exec(value);
    if (!ref) return value;
    if (seen.has(name)) throw new Error(`cycle at --color-${name}`);
    return resolve(ref[1]!, seen.add(name));
  };
  return new Map([...raw.keys()].map((name) => [name, resolve(name)]));
}

const tokens = colorTokens();

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const hex = (name: string) => {
  const value = tokens.get(name);
  if (!value) throw new Error(`no --color-${name}`);
  return value;
};

/** The color token a utility like `shadow-cove`, `bg-sky`, or `text-poly` refers to. */
const colorOf = (utility: string) => utility.replace(/^(shadow|bg|text)-/, "");

describe("Cal Poly palette", () => {
  it("has the brand colors Tuan supplied, at their exact values", () => {
    expect(hex("poly")).toBe("#154734");
    expect(hex("gold")).toBe("#bd8b13");
    expect(hex("cove")).toBe("#0067b9");
    expect(hex("heritage")).toBe("#ff6a39");
    expect(hex("mission")).toBe("#e4e3d3");
  });

  it("re-points the older tokens to Cal Poly colors", () => {
    expect(hex("gold-bright")).toBe(hex("canyon"));
    expect(hex("glyph-blue")).toBe(hex("cove"));
    expect(hex("tint-lilac")).toBe(hex("serenity"));
  });
});

describe("page themes", () => {
  for (const [page, theme] of Object.entries(pageThemes)) {
    describe(page, () => {
      it("uses only colors that exist as tokens", () => {
        const used = [
          theme.primary,
          theme.secondary,
          ...theme.shadows,
          theme.wash,
          theme.accentText,
        ];
        for (const utility of used) expect(tokens.has(colorOf(utility)), utility).toBe(true);
      });

      it("has accent text that passes WCAG AA (4.5:1) on paper and on cards", () => {
        const text = hex(colorOf(theme.accentText));
        expect(contrast(text, hex("paper"))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(text, hex("card"))).toBeGreaterThanOrEqual(4.5);
      });

      it("has a wash that ink text passes AA on", () => {
        expect(contrast(hex("ink"), hex(colorOf(theme.wash)))).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it("cycles card shadows through the theme", () => {
    const { portfolio } = pageThemes;
    expect(cardShadow(portfolio, 0)).toBe(portfolio.shadows[0]);
    expect(cardShadow(portfolio, portfolio.shadows.length)).toBe(portfolio.shadows[0]);
  });
});

describe("tints", () => {
  const tints = [...tokens.keys()].filter((name) => name.startsWith("tint-"));

  it.each(tints)("%s passes AA for ink and ink-muted text", (tint) => {
    // Archive columns and washes carry muted labels (dates, captions), not just ink headings.
    expect(contrast(hex("ink"), hex(tint))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("ink-muted"), hex(tint))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("focus ring", () => {
  it("is at least 3:1 against paper and cards (WCAG 1.4.11)", () => {
    const ring = /:focus-visible\s*{\s*outline:\s*3px solid var\(--color-([a-z-]+)\)/.exec(css);
    expect(ring).not.toBeNull();
    const color = hex(ring![1]!);
    expect(contrast(color, hex("paper"))).toBeGreaterThanOrEqual(3);
    expect(contrast(color, hex("card"))).toBeGreaterThanOrEqual(3);
  });
});
