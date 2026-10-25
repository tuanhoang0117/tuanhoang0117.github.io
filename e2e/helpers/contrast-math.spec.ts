import { expect, test } from "@playwright/test";
import {
  composite,
  contrastRatio,
  effectiveBackground,
  effectiveText,
  isLargeText,
  parseCssColor,
  relativeLuminance,
  requiredRatio,
  toHex,
  type Rgba,
} from "./contrast-math";

// Self-test for the contrast helper's arithmetic. Pure functions, so no page is needed. The
// reference ratios come from the WCAG definition: black on white is 21:1, #767676 on white is the
// lightest gray that still passes 4.5:1 (4.54), and #777777 is just under it (4.48).

const rgb = (r: number, g: number, b: number, a = 1): Rgba => ({ r, g, b, a });
const WHITE = rgb(255, 255, 255);
const BLACK = rgb(0, 0, 0);

test.describe("contrast math", () => {
  test("black on white is 21:1, and identical colors are 1:1", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(rgb(90, 90, 90), rgb(90, 90, 90))).toBeCloseTo(1, 5);
  });

  test("#767676 on white passes 4.5:1 and #777777 does not", () => {
    expect(contrastRatio(rgb(0x76, 0x76, 0x76), WHITE)).toBeCloseTo(4.54, 2);
    expect(contrastRatio(rgb(0x77, 0x77, 0x77), WHITE)).toBeCloseTo(4.48, 2);
    expect(contrastRatio(rgb(0x76, 0x76, 0x76), WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(0x77, 0x77, 0x77), WHITE)).toBeLessThan(4.5);
  });

  test("luminance uses the sRGB curve, so green outweighs red outweighs blue", () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
    const red = relativeLuminance(rgb(255, 0, 0));
    const green = relativeLuminance(rgb(0, 255, 0));
    const blue = relativeLuminance(rgb(0, 0, 255));
    expect(red).toBeCloseTo(0.2126, 4);
    expect(green).toBeCloseTo(0.7152, 4);
    expect(blue).toBeCloseTo(0.0722, 4);
  });

  test("luminance bends at the sRGB threshold: dark channels are linear, lighter ones curve", () => {
    // Below ~10/255 the sRGB curve is a straight line (c / 12.92); above it, a power curve. A
    // channel of 50 is well past the bend, so it tells the two apart: 0.0319, not 50/255/12.92.
    expect(relativeLuminance(rgb(5, 5, 5))).toBeCloseTo(5 / 255 / 12.92, 6);
    expect(relativeLuminance(rgb(50, 50, 50))).toBeCloseTo(0.0319, 4);
    expect(relativeLuminance(rgb(128, 128, 128))).toBeCloseTo(0.2159, 4);
  });

  test("alpha blending mixes channel by channel toward the color underneath", () => {
    expect(composite(rgb(0, 0, 0, 0.5), WHITE)).toEqual(rgb(127.5, 127.5, 127.5));
    expect(composite(rgb(200, 100, 0, 1), WHITE)).toEqual(rgb(200, 100, 0));
    expect(composite(rgb(200, 100, 0, 0), rgb(10, 20, 30))).toEqual(rgb(10, 20, 30));
  });

  test("half-transparent black text on white is gray, and fails 4.5:1", () => {
    const shown = effectiveText(rgb(0, 0, 0, 0.5), 1, WHITE);
    expect(toHex(shown)).toBe("#808080");
    // 127.5 per channel is not quite #808080 (128): 3.98, not 3.95.
    expect(contrastRatio(shown, WHITE)).toBeCloseTo(3.98, 2);
    expect(contrastRatio(shown, WHITE)).toBeLessThan(requiredRatio(16, 400));
  });

  test("opacity on the element chain lightens text the same way as color alpha", () => {
    const viaAlpha = effectiveText(rgb(0, 0, 0, 0.5), 1, WHITE);
    const viaOpacity = effectiveText(rgb(0, 0, 0), 0.5, WHITE);
    expect(viaOpacity).toEqual(viaAlpha);
    // Both multiply: 0.5 alpha under 0.5 opacity is 0.25.
    expect(effectiveText(rgb(0, 0, 0, 0.5), 0.5, WHITE)).toEqual(rgb(191.25, 191.25, 191.25));
  });

  test("large text is 24px and up, or 18.66px and up when bold, and needs only 3:1", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.65, 700)).toBe(false);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(14, 700)).toBe(false);
    expect(requiredRatio(24, 400)).toBe(3);
    expect(requiredRatio(16, 400)).toBe(4.5);
  });

  test("a ratio between 3 and 4.5 passes as large text and fails as small text", () => {
    const ratio = contrastRatio(rgb(0x94, 0x94, 0x94), WHITE);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
    expect(ratio >= requiredRatio(32, 400)).toBe(true);
    expect(ratio >= requiredRatio(16, 400)).toBe(false);
  });

  test("parses the color formats Chrome reports", () => {
    expect(parseCssColor("rgb(20, 20, 20)")).toEqual(rgb(20, 20, 20));
    expect(parseCssColor("rgba(20, 20, 20, 0.5)")).toEqual(rgb(20, 20, 20, 0.5));
    expect(parseCssColor("rgb(20 20 20 / 0.25)")).toEqual(rgb(20, 20, 20, 0.25));
    expect(parseCssColor("rgb(20 20 20 / 50%)")).toEqual(rgb(20, 20, 20, 0.5));
    expect(parseCssColor("color(srgb 1 0.5 0 / 0.5)")).toEqual(rgb(255, 127.5, 0, 0.5));
    expect(parseCssColor("rgba(0, 0, 0, 0)")).toEqual(rgb(0, 0, 0, 0));
    expect(parseCssColor("transparent")).toEqual(rgb(0, 0, 0, 0));
  });

  test("refuses colors it can't read, instead of guessing", () => {
    expect(parseCssColor("oklch(0.5 0.1 200)")).toBeNull();
    expect(parseCssColor("not a color")).toBeNull();
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("rgb(a, b, c)")).toBeNull();
  });

  test("the effective background is the nearest opaque layer, or paper when there is none", () => {
    const paper = rgb(251, 248, 241);
    expect(effectiveBackground([], paper)).toEqual(paper);
    expect(effectiveBackground([rgb(10, 20, 30)], paper)).toEqual(rgb(10, 20, 30));
    // The nearest layer wins; layers behind an opaque one are never reached.
    expect(effectiveBackground([rgb(10, 20, 30), rgb(200, 200, 200)], paper)).toEqual(
      rgb(10, 20, 30),
    );
  });

  test("semi-transparent backgrounds stack over what is behind them", () => {
    const paper = rgb(255, 255, 255);
    // 50% black over paper is mid gray.
    expect(effectiveBackground([rgb(0, 0, 0, 0.5)], paper)).toEqual(rgb(127.5, 127.5, 127.5));
    // 50% black over 50% white over a solid blue behind: the farthest layer is painted first.
    const stacked = effectiveBackground(
      [rgb(0, 0, 0, 0.5), rgb(255, 255, 255, 0.5), rgb(0, 0, 255)],
      paper,
    );
    // Blue, then 50% white gives (127.5, 127.5, 255), then 50% black gives half of that.
    expect(stacked).toEqual(rgb(63.75, 63.75, 127.5));
  });
});
