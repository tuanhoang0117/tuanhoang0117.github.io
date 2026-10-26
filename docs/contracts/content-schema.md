# Content schema

Types: [`src/content/types.ts`](../../src/content/types.ts).

All site copy lives in typed data files under `src/content/`. Pages and components render from
that data and never hard-code project text.

| File            | Holds                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| `site.ts`       | Name, location, time zone, school name, page prompts, socials, nav links        |
| `mascot.ts`     | The home mascot's visual source (`MascotVisualSource`) and accessible name      |
| `projects.ts`   | Personal and class projects (`Project[]`), some with a `CaseStudy`              |
| `hackathons.ts` | Hackathon projects (`Hackathon[]`), shown in the portfolio's Hackathons section |
| `resume.ts`     | Education, skills, experience, resume projects                                  |

## Rules

- `slug` is unique per collection and kebab-case. It becomes the URL (`/portfolio/:slug`;
  the `/hackathons/:slug` pages are archived in `archive/hackathons-page/`).
- `placement` is for wins only. An event that didn't win has no `placement`.
- `mascotVisual` stays `procedural-placeholder` until Tuan supplies approved mustang art. No agent
  generates or downloads horse art. An `image` source's `idleSrc` and `activeSrc` are same-origin
  paths under `public/` (for example `/mascot/mustang-head.png`): the mascot samples the image's
  pixels on a canvas, which a cross-origin image would block.
- `mascotLabel` is the mascot's accessible name.
- A `Project` may have a `caseStudy` (rendered at `/portfolio/:slug`), a `period` (display text,
  like "May – Aug 2026"), and `featured` (exactly one project: it is shown first and larger on
  the portfolio page). A `CaseStudy`'s `pdf` is a root-relative path to a file in `public/`, not an
  `https` link, so it lives outside `links`.
- Case-study copy is first person only where it describes Tuan's own work, and only claims what
  the private fact sheet confirms. It never names teammates or the client's contacts ("the team",
  "the association"). It never claims the Mailchimp signup or the donation flow: Tuan didn't do
  those. `content.test.ts` bans "Mailchimp" in all content and "donation" in the Develop for Good
  project, and checks names against
  a private, gitignored list (`private/name-denylist.txt`) on machines that have it.
- Optional fields mean **unknown**, not zero. Components must render cleanly when they're absent:
  hide the stat, don't show "0" or "undefined".
- Links are `https://` or `mailto:`. Images always have real alt text.
- `src/content/content.test.ts` enforces these rules. New collections get new tests.
- Changing a type is a contract change: it needs its own issue, and every consumer is updated in
  the same PR.
