/// <reference types="node" />
// axe can't resolve the graph-paper gradient behind /resume, so it never checks text contrast
// there. This measures every text/background pair the skills carousel uses, from the real
// tokens and the real class names in the component source.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/index.css", "utf8");
const source = readFileSync("src/components/stack/StackCards.tsx", "utf8");

function token(name: string, seen = new Set<string>()): string {
  const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`no --color-${name}`);
  const value = m[1]!.trim();
  const ref = /^var\(--color-([a-z-]+)\)$/.exec(value);
  if (!ref) return value;
  if (seen.has(name)) throw new Error(`cycle at ${name}`);
  return token(ref[1]!, seen.add(name));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const ratio = (fg: string, bg: string) => contrast(token(fg), token(bg));

describe("skills carousel text contrast (WCAG AA, 4.5:1)", () => {
  it("uses only the text and fill colors checked below", () => {
    const used = new Set(
      [...source.matchAll(/\b(text|bg)-([a-z-]+)\b/g)].map((m) => `${m[1]}-${m[2]}`),
    );
    const known = new Set([
      "text-ink-muted",
      "text-ink",
      "text-sm",
      "text-xs",
      "bg-card",
      "bg-gold-bright",
    ]);
    expect([...used].filter((u) => !known.has(u))).toEqual([]);
  });

  it("card labels and numbers (ink-muted) on the white card", () => {
    expect(ratio("ink-muted", "card")).toBeGreaterThanOrEqual(4.5);
  });

  it("card names and filter text (ink) on the white card", () => {
    expect(ratio("ink", "card")).toBeGreaterThanOrEqual(4.5);
  });

  it("filter counts (ink-muted) on the white filter bar", () => {
    expect(ratio("ink-muted", "card")).toBeGreaterThanOrEqual(4.5);
  });

  it("pause/play label and the pressed filter (ink) on Poly Canyon", () => {
    expect(ratio("ink", "gold-bright")).toBeGreaterThanOrEqual(4.5);
  });
});
