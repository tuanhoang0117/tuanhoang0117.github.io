# Content schema

Types: [`src/content/types.ts`](../../src/content/types.ts).

All site copy lives in typed data files under `src/content/`. Pages and components render from
that data and never hard-code project text.

| File            | Holds                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| `site.ts`       | Name, location, time zone, socials, nav links                               |
| `projects.ts`   | Personal and class projects (`Project[]`)                                   |
| `hackathons.ts` | Hackathon projects (`Hackathon[]`), which power the archive and event pages |
| `resume.ts`     | Education, skills, experience, resume projects                              |

## Rules

- `slug` is unique per collection and kebab-case. It becomes the URL (`/hackathons/:slug`).
- Optional fields mean **unknown**, not zero. Components must render cleanly when they're absent:
  hide the stat, don't show "0" or "undefined".
- Links are `https://` or `mailto:`. Images always have real alt text.
- `src/content/content.test.ts` enforces these rules. New collections get new tests.
- Changing a type is a contract change: it needs its own issue, and every consumer is updated in
  the same PR.
