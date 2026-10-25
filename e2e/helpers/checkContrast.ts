import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export type Color = { r: number; g: number; b: number; a: number };

export function parseColor(value: string): Color {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1]!.length === 3 ? [...hex[1]!].map((digit) => digit + digit).join("") : hex[1]!;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) throw new Error(`Unsupported computed color: ${value}`);
  const channels = rgb[1]!
    .replaceAll("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  return {
    r: Number.parseFloat(channels[0]!),
    g: Number.parseFloat(channels[1]!),
    b: Number.parseFloat(channels[2]!),
    a: channels[3] === undefined ? 1 : Number.parseFloat(channels[3]),
  };
}

export function alphaBlend(foreground: Color, background: Color): Color {
  const alpha = Math.max(0, Math.min(1, foreground.a));
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1,
  };
}

function composite(foreground: Color, background: Color): Color {
  const foregroundAlpha = Math.max(0, Math.min(1, foreground.a));
  const backgroundAlpha = Math.max(0, Math.min(1, background.a));
  const alpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r:
      (foreground.r * foregroundAlpha + background.r * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    g:
      (foreground.g * foregroundAlpha + background.g * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    b:
      (foreground.b * foregroundAlpha + background.b * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    a: alpha,
  };
}

function luminance(color: Color): number {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function contrastRatio(first: Color, second: Color): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

export function contrastThreshold(fontSize: number, fontWeight: number): number {
  return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}

type StyleSnapshot = {
  selector: string;
  index: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  fontSize: number;
  fontWeight: number;
  opacity: number;
  hidden: boolean;
  backgrounds: string[];
};

function formatColor(color: Color): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

export async function checkContrast(page: Page): Promise<void> {
  const { incomplete } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const paper = await page.evaluate(() => {
    const token = document.createElement("span");
    token.style.backgroundColor = "var(--color-paper)";
    document.documentElement.append(token);
    const color = getComputedStyle(token).backgroundColor;
    token.remove();
    return color;
  });
  const fallback = parseColor(paper);
  const failures: string[] = [];
  const seen = new Set<string>();

  for (const node of incomplete.flatMap((rule) => rule.nodes)) {
    for (const target of node.target) {
      const selector = typeof target === "string" ? target : target.join(" >>> ");
      const snapshots = await page
        .locator(selector)
        .evaluateAll((elements, target): StyleSnapshot[] => {
          return elements.map((element, index) => {
            const ancestors: Element[] = [];
            for (let current: Element | null = element; current; current = current.parentElement) {
              ancestors.unshift(current);
            }
            const style = getComputedStyle(element);
            let opacity = 1;
            let hidden = false;
            const backgrounds = ancestors.map((ancestor) => {
              const ancestorStyle = getComputedStyle(ancestor);
              const rect = ancestor.getBoundingClientRect();
              const alpha = Number.parseFloat(ancestorStyle.opacity);
              opacity *= alpha;
              hidden ||=
                ancestorStyle.display === "none" ||
                ancestorStyle.visibility === "hidden" ||
                ancestorStyle.visibility === "collapse" ||
                rect.width === 0 ||
                rect.height === 0;
              return ancestorStyle.backgroundColor;
            });
            return {
              selector: target,
              index,
              color: style.color,
              strokeColor: style.getPropertyValue("-webkit-text-stroke-color"),
              strokeWidth:
                Number.parseFloat(style.getPropertyValue("-webkit-text-stroke-width")) || 0,
              fontSize: Number.parseFloat(style.fontSize),
              fontWeight: Number.parseFloat(style.fontWeight) || 400,
              opacity,
              hidden,
              backgrounds,
            };
          });
        }, selector);

      for (const snapshot of snapshots) {
        const key = `${snapshot.selector}:${snapshot.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (snapshot.hidden || snapshot.opacity <= 0) continue;

        let localBackground: Color = { r: 0, g: 0, b: 0, a: 0 };
        for (const layer of snapshot.backgrounds) {
          localBackground = composite(parseColor(layer), localBackground);
        }
        const background = alphaBlend(
          { ...localBackground, a: localBackground.a * snapshot.opacity },
          fallback,
        );
        const fill = parseColor(snapshot.color);
        const foreground =
          fill.a === 0 && snapshot.strokeWidth > 0 ? parseColor(snapshot.strokeColor) : fill;
        if (foreground.a * snapshot.opacity <= 0) continue;
        const localText = composite(foreground, localBackground);
        const text = alphaBlend({ ...localText, a: localText.a * snapshot.opacity }, fallback);
        const ratio = contrastRatio(text, background);
        const threshold = contrastThreshold(snapshot.fontSize, snapshot.fontWeight);
        if (ratio + 0.005 < threshold) {
          failures.push(
            `${snapshot.selector}: text ${formatColor(text)} on ${formatColor(background)} has ${ratio.toFixed(2)}:1 (needs ${threshold}:1)`,
          );
        }
      }
    }
  }

  if (failures.length) throw new Error(`Low contrast on graph paper:\n${failures.join("\n")}`);
}
