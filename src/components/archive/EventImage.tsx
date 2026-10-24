import { useState } from "react";
import type { Image, Tint } from "../../content/types";
import { tintStyles } from "./tints";

interface EventImageProps {
  image?: Image;
  tint: Tint;
  /** Seeds the placeholder pattern so each event's placeholder looks different. */
  seed: string;
}

const COLS = 16;
const ROWS = 9;

function hash(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Deterministic scatter of lit cells on a 16×9 grid, matching the image's 16:9 frame. */
function pixelCells(seed: string): Array<[number, number]> {
  const h = hash(seed);
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x * 7 + y * 13 + h) % 5 === 0 || (x + y + h) % 11 === 0) cells.push([x, y]);
    }
  }
  return cells;
}

function PixelPlaceholder({ tint, seed }: { tint: Tint; seed: string }) {
  return (
    <svg
      data-testid="image-placeholder"
      aria-hidden="true"
      viewBox={`0 0 ${COLS} ${ROWS}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={`block aspect-video w-full bg-card ${tintStyles[tint].accentText}`}
    >
      {pixelCells(seed).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

/** The event photo on a solid offset block in the tint's accent. Falls back to a pixel pattern. */
export function EventImage({ image, tint, seed }: EventImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = image && !failed;

  return (
    // Padding reserves room for the offset block, so it never pokes out of the column.
    <div className="relative pr-3 pb-3">
      <div
        aria-hidden="true"
        className={`absolute top-3 right-0 bottom-0 left-3 ${tintStyles[tint].accentBg}`}
      />
      <div className="relative border-2 border-ink">
        {showImage ? (
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className="block aspect-video w-full bg-card object-cover"
          />
        ) : (
          <PixelPlaceholder tint={tint} seed={seed} />
        )}
      </div>
    </div>
  );
}
