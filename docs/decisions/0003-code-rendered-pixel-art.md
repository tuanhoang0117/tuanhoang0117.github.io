# 0003. Pixel art is rendered from code, not image files

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Tuan Hoang, Claude Code

## Context

The site has almost no photography to work with. quackhacks.org's story scenes have the same
character without photos: each scene is roughly 3,000 SVG `<rect>` elements with ~130 running
animations and zero image files. Their duck sprites are SVGs drawn with
`shape-rendering="crispEdges"`.

The mascot is a pixel-art Musty the Mustang, drawn by a friend.

## Decision

- Sprites are defined as **text grids plus a palette** (see `docs/contracts/sprite-format.md`) and
  rendered to SVG `<rect>`s by a small in-repo engine. No hand-written rect markup.
- Scenes are composed from sprites and simple shapes in React components.
- Sprite animation uses **frame stepping** (`steps()` timing / frame swapping), not smooth tweens.
- Artist-supplied PNGs are converted to the text-grid format with a script, so art stays diffable
  and reviewable in PRs.

## Consequences

- Art changes show up as readable diffs.
- Rendering thousands of `<rect>`s has a cost. Scenes merge horizontal runs of the same color into
  one rect, and off-screen scenes pause their animations.
- The engine is a core piece of code and is written with full unit test coverage.
