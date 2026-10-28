import { PageHeader } from "../components/ui/PageHeader";
import { pagePrompts } from "../content/site";
import { toRuns } from "../pixel/runs";
import { Sprite } from "../pixel/Sprite";
import { sprites } from "../pixel/sprites";
import type { SpriteDef } from "../pixel/types";
import { pixelsOf } from "../pixel/validate";

// A gallery for checking sprites by eye. Not linked from the nav.

const LAB_SCALES = [1, 4, 8] as const;

function stats(sprite: SpriteDef) {
  const first = sprite.frames[0] ?? [];
  return {
    width: first[0] === undefined ? 0 : pixelsOf(first[0]).length,
    height: first.length,
    frames: sprite.frames.length,
    rects: sprite.frames.map((frame) => toRuns(frame, sprite.palette).length),
  };
}

function SpriteEntry({ sprite }: { sprite: SpriteDef }) {
  const { width, height, frames, rects } = stats(sprite);
  const headingId = `sprite-${sprite.name}`;
  const facts = [
    { term: "Size", value: `${width}×${height}` },
    { term: "Frames", value: String(frames) },
    { term: "Rects per frame", value: rects.join(" / ") },
  ];

  return (
    <li>
      <section
        aria-labelledby={headingId}
        data-testid="lab-sprite"
        className="border-2 border-ink bg-card p-4 shadow-block sm:p-6"
      >
        <h2 id={headingId} className="font-mono text-lg font-bold">
          {sprite.name}
        </h2>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          {facts.map(({ term, value }) => (
            <div key={term}>
              <dt className="label-mono text-ink-muted">{term}</dt>
              <dd className="font-mono text-sm" data-fact={term}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {/* Large scales of large sprites can be wider than a phone; scroll here, not the page. */}
        <div
          role="group"
          aria-label={`${sprite.name} previews`}
          tabIndex={0}
          className="mt-6 overflow-x-auto"
        >
          <ul className="flex flex-wrap items-end gap-6">
            {LAB_SCALES.map((scale) => (
              <li key={scale}>
                <figure>
                  <Sprite sprite={sprite} scale={scale} label={`${sprite.name} at ${scale}×`} />
                  <figcaption className="label-mono mt-2 text-ink-muted">{scale}×</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </li>
  );
}

export function Lab() {
  return (
    <>
      <PageHeader title="Pixel Lab" prompt={pagePrompts.lab} />
      <ul className="mx-auto max-w-6xl space-y-8 px-4 pb-16 sm:px-8">
        {sprites.map((sprite) => (
          <SpriteEntry key={sprite.name} sprite={sprite} />
        ))}
      </ul>
    </>
  );
}
