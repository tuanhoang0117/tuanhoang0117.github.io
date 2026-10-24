# Content schema

Types: [`src/content/types.ts`](../../src/content/types.ts).

All site copy lives in typed data files under `src/content/`. Pages and components render from
that data and never hard-code project text.

| File            | Holds                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| `site.ts`       | Name, location, time zone, school name, page prompts, socials, nav links    |
| `mascot.ts`     | The home mascot's visual source (`MascotVisualSource`) and accessible name  |
| `projects.ts`   | Personal and class projects (`Project[]`)                                   |
| `hackathons.ts` | Hackathon projects (`Hackathon[]`), which power the archive and event pages |
| `resume.ts`     | Education, skills, experience, resume projects                              |

## Rules

- `slug` is unique per collection and kebab-case. It becomes the URL (`/hackathons/:slug`,
  `/portfolio/:slug`).
- `placement` is for wins only. An event that didn't win has no `placement`.
- `mascotVisual` stays `procedural-placeholder` until Tuan supplies approved mustang art. No agent
  generates or downloads horse art. An `image` source's `idleSrc` and `activeSrc` are same-origin
  paths under `public/` (for example `/mascot/mustang-head.png`): the mascot samples the image's
  pixels on a canvas, which a cross-origin image would block.
- `mascotLabel` is the mascot's accessible name.
- Optional fields mean **unknown**, not zero. Components must render cleanly when they're absent:
  hide the stat, don't show "0" or "undefined".
- Links are `https://` or `mailto:`. Images always have real alt text.
- `src/content/content.test.ts` enforces these rules. New collections get new tests.
- Changing a type is a contract change: it needs its own issue, and every consumer is updated in
  the same PR.
