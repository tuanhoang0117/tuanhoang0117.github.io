import type { ContactKind } from "./links";

// Pixel grids: "#" is a filled pixel. Drawn in code so they stay crisp at any size.
const grids: Record<ContactKind, string[]> = {
  email: [
    "#########",
    "##.....##",
    "#.#...#.#",
    "#..#.#..#",
    "#...#...#",
    "#.......#",
    "#########",
  ],
  linkedin: [
    "#########",
    "##.######",
    "#########",
    "##.#...##",
    "##.#.##.#",
    "##.#.##.#",
    "##.#.##.#",
    "#########",
  ],
  github: [
    ".#.....#.",
    ".##...##.",
    ".#######.",
    "#########",
    "##..#..##",
    "#########",
    ".#######.",
    "..#.#.#..",
    "..#...#..",
  ],
  other: ["..#...", "...#..", "######", "...#..", "..#..."],
};

export function ContactIcon({ kind }: { kind: ContactKind }) {
  const rows = grids[kind];
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${width} ${rows.length}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      className="size-5 shrink-0"
    >
      {rows.flatMap((row, y) =>
        [...row].map((px, x) =>
          px === "#" ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}
