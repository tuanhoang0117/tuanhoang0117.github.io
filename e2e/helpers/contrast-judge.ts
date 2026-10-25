import {
  contrastRatio,
  effectiveBackground,
  effectiveText,
  parseCssColor,
  requiredRatio,
  toHex,
  type Rgba,
} from "./contrast-math";
import type { NodeFacts } from "./contrast-page";

/** One line per failing node, with everything needed to find and fix the text. */
export interface ContrastFailure {
  selector: string;
  text: string;
  textColor: string;
  backgroundColor: string;
  ratio: number;
  required: number;
  fontSize: number;
  fontWeight: number;
}

export type Verdict =
  /** Not on screen (hidden, display: none, transparent, or zero-sized): nothing to read. */
  | { kind: "invisible" }
  /** Glyphs painted by a clipped background gradient: no single ratio exists, so a person looks. */
  | { kind: "gradient" }
  | { kind: "pass"; ratio: number }
  | { kind: "fail"; failure: ContrastFailure };

export function formatFailure(f: ContrastFailure): string {
  return (
    `${f.selector} "${f.text}": ${f.textColor} on ${f.backgroundColor} = ` +
    `${f.ratio.toFixed(2)}:1, needs ${f.required}:1 (${f.fontSize}px, weight ${f.fontWeight})`
  );
}

/** Parses a color the browser reported, or throws: an unreadable color must never pass silently. */
export function colorOrThrow(value: string, what: string, selector: string): Rgba {
  const parsed = parseCssColor(value);
  if (!parsed) throw new Error(`Can't read ${what} "${value}" for ${selector}`);
  return parsed;
}

/**
 * Decides one text node. `paper` is the computed value of the `--color-paper` token, used as the
 * background when no element behind the text has a solid color.
 */
export function judgeNode(facts: NodeFacts, paper: Rgba): Verdict {
  if (!facts.visible) return { kind: "invisible" };
  if (facts.clipsBackgroundToText) return { kind: "gradient" };

  const layers = facts.backgrounds.map((bg) => colorOrThrow(bg, "a background", facts.selector));
  const background = effectiveBackground(layers, paper);

  // Hollow display text (`text-outline`) has a transparent fill and is drawn by its stroke.
  let textColor = colorOrThrow(facts.color, "a text color", facts.selector);
  if (textColor.a === 0 && facts.strokeWidth > 0) {
    textColor = colorOrThrow(facts.strokeColor, "a stroke color", facts.selector);
  }
  const shown = effectiveText(textColor, facts.opacity, background);

  const ratio = contrastRatio(shown, background);
  const required = requiredRatio(facts.fontSize, facts.fontWeight);
  if (ratio >= required) return { kind: "pass", ratio };
  return {
    kind: "fail",
    failure: {
      selector: facts.selector,
      text: facts.text,
      textColor: toHex(shown),
      backgroundColor: toHex(background),
      ratio,
      required,
      fontSize: facts.fontSize,
      fontWeight: facts.fontWeight,
    },
  };
}
