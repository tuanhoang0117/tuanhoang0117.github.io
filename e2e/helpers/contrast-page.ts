/**
 * The part of the contrast check that runs inside the page. Playwright serializes
 * `readNodeFacts` and runs it in the browser, so it can only use browser globals: no imports and
 * nothing from the rest of this folder.
 */

/** What the browser reports about one text element. Colors are computed CSS strings. */
export interface NodeFacts {
  selector: string;
  visible: boolean;
  text: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  fontSize: number;
  fontWeight: number;
  /** True when the glyphs are painted by the element's background (`bg-clip-text`), not by `color`. */
  clipsBackgroundToText: boolean;
  /** Product of `opacity` from the element up to the root. */
  opacity: number;
  /** Background colors from the element up to the root, nearest first, transparent ones skipped. */
  backgrounds: string[];
}

export function readNodeFacts(selectors: string[]): { paper: string; nodes: NodeFacts[] } {
  // `var(--color-paper)` as a computed color, so the fallback follows the token.
  const probe = document.createElement("span");
  probe.style.backgroundColor = "var(--color-paper)";
  document.body.appendChild(probe);
  const paper = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const nodes = selectors.map((selector): NodeFacts => {
    const el = document.querySelector<HTMLElement>(selector);
    const empty: NodeFacts = {
      selector,
      visible: false,
      text: "",
      color: "",
      strokeColor: "",
      strokeWidth: 0,
      fontSize: 0,
      fontWeight: 400,
      clipsBackgroundToText: false,
      opacity: 0,
      backgrounds: [],
    };
    if (!el) return empty;

    const own = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    let opacity = 1;
    let hidden = own.visibility === "hidden" || own.visibility === "collapse";
    const backgrounds: string[] = [];
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none") hidden = true;
      opacity *= Number.parseFloat(style.opacity);
      const bg = style.backgroundColor;
      // "rgba(0, 0, 0, 0)" is the browser's transparent: nothing to blend, so skip it.
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") backgrounds.push(bg);
    }
    return {
      selector,
      visible: !hidden && opacity > 0 && rect.width > 0 && rect.height > 0,
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      color: own.color,
      strokeColor: own.webkitTextStrokeColor,
      strokeWidth: Number.parseFloat(own.webkitTextStrokeWidth) || 0,
      fontSize: Number.parseFloat(own.fontSize),
      fontWeight: Number.parseInt(own.fontWeight, 10) || 400,
      clipsBackgroundToText: own.backgroundClip === "text" || own.webkitBackgroundClip === "text",
      opacity,
      backgrounds,
    };
  });
  return { paper, nodes };
}
