// Draws the browser-tab icons from Musty's first idle frame, so the tab matches the mascot.
// Colors come from the tokens in src/styles/index.css. Writes favicon.svg, the 16/32/180 PNGs and
// favicon.ico into public/. Run: node scripts/favicon.ts
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

// The sprite file imports a type, so read its data as text rather than importing it.
const spriteSource = read("src/pixel/sprites/musty-idle.ts");
const palette = Object.fromEntries(
  [...spriteSource.matchAll(/^\s+(\w): "var\(--color-([\w-]+)\)",$/gm)].map((m) => [m[1], m[2]]),
);
const firstFrame = spriteSource.slice(spriteSource.indexOf("frames: ["));
const rows = [...firstFrame.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]!).slice(0, 16);

const css = read("src/styles/index.css");
function token(name: string): string {
  const value = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`no --color-${name} in index.css`);
  const alias = value.match(/^var\(--color-([\w-]+)\)$/);
  return alias ? token(alias[1]!) : value;
}
const hex: Record<string, string> = Object.fromEntries(
  Object.entries(palette).map(([key, name]) => [key, token(name)]),
);

const size = rows.length;
if (size !== 16 || rows.some((r) => r.length !== 16)) throw new Error("expected a 16x16 frame");

// SVG: one rect per pixel run, crisp at any size.
const rects = rows.flatMap((row, y) =>
  [...row.matchAll(/([^.])\1*/g)].map(
    (m) => `<rect x="${m.index}" y="${y}" width="${m[0].length}" height="1" fill="${hex[m[1]!]}"/>`,
  ),
);
writeFileSync(
  new URL("public/favicon.svg", root),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join("")}</svg>\n`,
);

// PNG: nearest-neighbour scale of the frame with `pad` px around it. Empty pixels are transparent,
// or `background` when given.
function png(scale: number, pad = 0, background?: string): Buffer {
  const side = size * scale + pad * 2;
  const raw = Buffer.alloc(side * (side * 4 + 1));
  for (let y = 0; y < side; y++) {
    const line = y * (side * 4 + 1);
    for (let x = 0; x < side; x++) {
      const [sx, sy] = [Math.floor((x - pad) / scale), Math.floor((y - pad) / scale)];
      const inside = sx >= 0 && sy >= 0 && sx < size && sy < size;
      const key = inside ? rows[sy]![sx]! : ".";
      const fill = key === "." ? background : hex[key];
      if (!fill) continue;
      const color = fill.replace("#", "");
      const at = line + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[at + i] = parseInt(color.slice(i * 2, i * 2 + 2), 16);
      raw[at + 3] = 255;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(data: Buffer): number {
  let c = ~0;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

const png16 = png(1);
const png32 = png(2);
writeFileSync(new URL("public/favicon-16x16.png", root), png16);
writeFileSync(new URL("public/favicon-32x32.png", root), png32);
// Apple touch icons get no transparency on iOS, so this one keeps a card-white background.
const touch = png(11, 2, token("card"));
writeFileSync(new URL("public/apple-touch-icon.png", root), touch);

// ICO with the two PNGs embedded, which every current browser reads.
const images = [png16, png32];
const ico = Buffer.alloc(6 + 16 * images.length);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(images.length, 4);
let offset = ico.length;
images.forEach((image, i) => {
  const side = i === 0 ? 16 : 32;
  const entry = 6 + i * 16;
  ico.writeUInt8(side, entry);
  ico.writeUInt8(side, entry + 1);
  ico.writeUInt16LE(1, entry + 4);
  ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(image.length, entry + 8);
  ico.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(new URL("public/favicon.ico", root), Buffer.concat([ico, ...images]));
