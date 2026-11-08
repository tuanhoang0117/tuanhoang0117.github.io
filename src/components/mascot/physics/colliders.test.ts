import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animationsSettled, measureColliders } from "./colliders";

type Box = { x: number; y: number; width: number; height: number };

/** Boxes for the text a Range selects, as the browser's layout would report them. */
let wordBoxes: Record<string, Box[]>;
let metrics: Partial<TextMetrics>;
let measured: { text: string; font: string }[];

const domRect = ({ x, y, width, height }: Box) => new DOMRect(x, y, width, height);

/** Gives an element a layout box. */
function place(selector: string, box: Box) {
  document.querySelector(selector)!.getBoundingClientRect = () => domRect(box);
}

beforeEach(() => {
  wordBoxes = {};
  metrics = {};
  measured = [];
  document.body.innerHTML = "";
  Range.prototype.getClientRects = function (this: Range) {
    return (wordBoxes[this.toString()] ?? []).map(domRect) as unknown as DOMRectList;
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = {
      font: "",
      measureText(text: string) {
        measured.push({ text, font: ctx.font });
        return metrics as TextMetrics;
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const A: Box = { x: 10, y: 20, width: 100, height: 50 };
const B: Box = { x: 130, y: 20, width: 80, height: 50 };

describe("measureColliders", () => {
  it("makes one rectangle per word of a heading, from the rendered text", () => {
    document.body.innerHTML = "<main><h1>Tuan Hoang</h1></main>";
    wordBoxes = { Tuan: [A], Hoang: [B] };
    expect(measureColliders()).toEqual([A, B]);
  });

  it("makes one rectangle per line for a word that breaks across lines", () => {
    document.body.innerHTML = "<main><h2>Supercalifragilistic</h2></main>";
    wordBoxes = { Supercalifragilistic: [A, { ...A, y: 70 }] };
    expect(measureColliders()).toEqual([A, { ...A, y: 70 }]);
  });

  it("walks every text node, and skips decorative copies of a word", () => {
    document.body.innerHTML = `<main><h1><span>Tuan</span> <span><span>Hoang</span>
      <span aria-hidden="true">Shimmer</span></span></h1></main>`;
    wordBoxes = { Tuan: [A], Hoang: [B], Shimmer: [{ ...B, x: 500 }] };
    expect(measureColliders()).toEqual([A, B]);
  });

  it("hugs the letters vertically, not the font's full height", () => {
    document.body.innerHTML = '<main><h1 style="text-transform: uppercase">Lab</h1></main>';
    wordBoxes = { Lab: [{ x: 10, y: 100, width: 200, height: 140 }] };
    metrics = {
      fontBoundingBoxAscent: 110,
      actualBoundingBoxAscent: 90,
      actualBoundingBoxDescent: 2,
    };
    // Baseline at 100 + 110 = 210: letters run from 120 to 212.
    expect(measureColliders()).toEqual([{ x: 10, y: 120, width: 200, height: 92 }]);
    // Uppercased on screen, so the letters measured are the ones the visitor sees.
    expect(measured[0]!.text).toBe("LAB");
  });

  it("keeps the word's box when the browser can't measure letters", () => {
    document.body.innerHTML = "<main><h1>Lab</h1></main>";
    wordBoxes = { Lab: [A] };
    expect(measureColliders()).toEqual([A]);
  });

  it("skips screen-reader-only headings and collapsed elements", () => {
    document.body.innerHTML = '<main><h2>Hidden</h2><img alt="" /></main>';
    wordBoxes = { Hidden: [{ x: 0, y: 0, width: 1, height: 1 }] };
    place("img", { x: 0, y: 0, width: 0, height: 0 });
    expect(measureColliders()).toEqual([]);
  });

  it("leaves body paragraphs out", () => {
    document.body.innerHTML = "<main><p>Readable text</p></main>";
    wordBoxes = { Readable: [A], text: [B], "Readable text": [A] };
    place("p", A);
    expect(measureColliders()).toEqual([]);
  });

  it("leaves headings outside the page content out", () => {
    document.body.innerHTML = "<nav><h2>Menu</h2></nav><main></main>";
    wordBoxes = { Menu: [A] };
    expect(measureColliders()).toEqual([]);
  });

  it("treats the Cal Poly strip as one block, whatever text scrolls inside it", () => {
    document.body.innerHTML = `<main><div data-testid="school-banner" data-state="shown">
      <span>California Polytechnic</span></div></main>`;
    place('[data-testid="school-banner"]', A);
    expect(measureColliders()).toEqual([A]);
  });

  it("leaves out a strip that has faded away", () => {
    document.body.innerHTML = '<div data-testid="school-banner" data-state="hidden"></div>';
    place('[data-testid="school-banner"]', A);
    expect(measureColliders()).toEqual([]);
  });

  it("makes the photo a rectangle", () => {
    document.body.innerHTML = '<main><img alt="" /></main>';
    place("img", A);
    expect(measureColliders()).toEqual([A]);
  });

  it("makes a card one rectangle, without extra bodies for its heading or image", () => {
    document.body.innerHTML = '<main><article><h3>Project</h3><img alt="" /></article></main>';
    place("article", A);
    place("img", B);
    wordBoxes = { Project: [B] };
    expect(measureColliders()).toEqual([A]);
  });

  it("makes the prompt, its divider, and the counter solid, with room for a sprite's corners", () => {
    document.body.innerHTML = `<main><div>
      <p data-mascot-prompt="">Click me</p>
      <span aria-hidden="true">/</span>
      <p data-mascot-counter="">Clicks: 1</p></div></main>`;
    place("[data-mascot-prompt]", A);
    place("[aria-hidden]", { ...A, x: 111, width: 10 });
    place("[data-mascot-counter]", B);
    const grown = ({ x, y, width, height }: Box) => ({
      x: x - 7,
      y: y - 7,
      width: width + 14,
      height: height + 14,
    });
    expect(measureColliders()).toEqual([grown(A), grown({ ...A, x: 111, width: 10 }), grown(B)]);
  });

  it("tolerates a page with none of the listed elements", () => {
    document.body.innerHTML = "<main><p>Nothing to land on</p></main>";
    expect(measureColliders()).toEqual([]);
  });

  it("reads which elements count from one list", () => {
    document.body.innerHTML = "<main><p>Widened</p></main>";
    place("p", A);
    expect(measureColliders(document, [{ selector: "main p", shape: "block" }])).toEqual([A]);
  });
});

describe("animationsSettled", () => {
  const animation = (iterations: number, finished: Promise<unknown>) =>
    ({ effect: { getComputedTiming: () => ({ iterations }) }, finished }) as unknown as Animation;

  const pendingState = async (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve));
    return done;
  };

  it("resolves at once with nothing running, and without the Web Animations API", async () => {
    await expect(animationsSettled({} as Document)).resolves.toBeUndefined();
    const doc = { getAnimations: () => [] } as unknown as Document;
    await expect(animationsSettled(doc)).resolves.toBeUndefined();
  });

  it("waits for finite animations, ignoring endless ones", async () => {
    let finish = () => {};
    const entrance = new Promise<void>((resolve) => (finish = resolve));
    const endless = animation(Infinity, new Promise(() => {}));
    let running = [animation(1, entrance), endless];
    const doc = { getAnimations: () => running } as unknown as Document;

    const settled = animationsSettled(doc);
    expect(await pendingState(settled)).toBe(false);

    running = [endless];
    finish();
    expect(await pendingState(settled)).toBe(true);
  });

  it("counts a cancelled animation as finished, and waits for ones that start after", async () => {
    let finishLate = () => {};
    const late = animation(1, new Promise<void>((resolve) => (finishLate = resolve)));
    let running = [animation(1, Promise.reject(new DOMException("cancelled", "AbortError")))];
    const doc = {
      getAnimations: () => {
        const current = running;
        running = [late];
        return current;
      },
    } as unknown as Document;

    const settled = animationsSettled(doc);
    expect(await pendingState(settled)).toBe(false);

    running = [];
    finishLate();
    expect(await pendingState(settled)).toBe(true);
  });
});
