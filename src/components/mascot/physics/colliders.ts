/** A page element's box in viewport (client) coordinates, which are also physics coordinates. */
export interface ColliderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColliderSource {
  selector: string;
  /** "words": one rectangle per rendered word, hugging its letters. "block": the element's box. */
  shape: "words" | "block";
  /** Extra CSS pixels of solid space around a block. */
  margin?: number;
}

/**
 * A token's collision circle fits its art unrotated, but a rotated sprite's corners reach past it:
 * about 0.41 of the 16px radius, for a square sprite at 45 degrees.
 */
const ROTATED_CORNER_REACH = 7;

const HEADINGS = ":is(h1, h2, h3, h4, h5, h6)";

/**
 * Every page element tokens collide with. This list is the only thing to change to widen or narrow
 * that. Body paragraphs stay out so tokens never sit on text people are reading. A selector that
 * matches nothing on a page is simply skipped.
 */
export const COLLIDER_SOURCES: readonly ColliderSource[] = [
  // A card is one block, so its own heading and image don't add bodies inside it.
  { selector: `main ${HEADINGS}:not(article *)`, shape: "words" },
  // The Cal Poly strip, home page only. Its fixed form fades out once scrolled past.
  { selector: '[data-testid="school-banner"]:not([data-state="hidden"])', shape: "block" },
  { selector: "main img:not(article *)", shape: "block" },
  { selector: "main article", shape: "block" },
  // Tokens must never cover the mustang's prompt or counter, so they are solid too, with room for a
  // sprite's corners. The slash between them closes a gap a token could otherwise wedge into.
  {
    selector:
      "[data-mascot-prompt], [data-mascot-prompt] + [aria-hidden='true'], [data-mascot-counter]",
    shape: "block",
    margin: ROTATED_CORNER_REACH,
  },
];

/** Screen-reader-only text measures about 1px. Nothing that small is visible to land on. */
const MIN_SIDE = 2;

const isVisible = (rect: { width: number; height: number }) =>
  rect.width >= MIN_SIDE && rect.height >= MIN_SIDE;

const toRect = ({ x, y, width, height }: ColliderRect): ColliderRect => ({ x, y, width, height });

let textContext: CanvasRenderingContext2D | null | undefined;
const measuringContext = () =>
  textContext === undefined
    ? (textContext = document.createElement("canvas").getContext("2d"))
    : textContext;

const CASE_OF: Record<string, (word: string) => string> = {
  uppercase: (word) => word.toUpperCase(),
  lowercase: (word) => word.toLowerCase(),
};

/**
 * A word's rendered box is the font's full height, well above and below the letters. At display
 * sizes that would leave tokens floating, so the top and bottom come from the letters themselves:
 * the box's top plus the font's ascent is the baseline, and the letters' extents hang off that.
 */
function hugLetters(word: string, box: ColliderRect, style: CSSStyleDeclaration): ColliderRect {
  const ctx = measuringContext();
  if (!ctx?.measureText) return box;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = ctx.measureText((CASE_OF[style.textTransform] ?? String)(word));
  const baseline = box.y + metrics.fontBoundingBoxAscent;
  const top = baseline - metrics.actualBoundingBoxAscent;
  const bottom = baseline + metrics.actualBoundingBoxDescent;
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return box;
  return { x: box.x, y: top, width: box.width, height: bottom - top };
}

function measureWords(heading: Element): ColliderRect[] {
  const doc = heading.ownerDocument;
  const style = getComputedStyle(heading);
  const walker = doc.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  const rects: ColliderRect[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Decorative copies, like the shimmer over the name, repeat a word already measured.
    if (node.parentElement?.closest("[aria-hidden='true']")) continue;
    for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      // One rectangle per line: a long word can break across lines.
      for (const box of range.getClientRects()) {
        if (isVisible(box)) rects.push(hugLetters(match[0], toRect(box), style));
      }
    }
  }
  return rects;
}

/** Reads layout. Call it once per change, never once per physics step. */
export function measureColliders(
  root: ParentNode = document,
  sources: readonly ColliderSource[] = COLLIDER_SOURCES,
): ColliderRect[] {
  return sources.flatMap(({ selector, shape, margin = 0 }) =>
    Array.from(root.querySelectorAll(selector)).flatMap((element) => {
      if (shape === "words") return measureWords(element);
      const box = element.getBoundingClientRect();
      if (!isVisible(box)) return [];
      return [
        {
          x: box.x - margin,
          y: box.y - margin,
          width: box.width + margin * 2,
          height: box.height + margin * 2,
        },
      ];
    }),
  );
}

/**
 * Resolves once the page's entrance animations have finished, so layout is read at rest. Endless
 * animations (the strip's scroll, the shimmer) never finish and don't count.
 */
export async function animationsSettled(doc: Document = document): Promise<void> {
  if (typeof doc.getAnimations !== "function") return;
  for (;;) {
    const running = doc
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    if (running.length === 0) return;
    await Promise.allSettled(running.map((animation) => animation.finished));
  }
}
