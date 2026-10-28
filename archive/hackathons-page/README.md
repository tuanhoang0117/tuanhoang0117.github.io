# Archived: the `/hackathons` page

This folder holds the code for the retired `/hackathons` archive page and its
`/hackathons/:slug` detail route. It is kept so the page can be restored later. It is not part of
the site: nothing imports it, and no tool runs on it (build, lint, format check, typecheck, unit
tests, e2e).

## Why it was archived

`/portfolio` gets its own Hackathons section (issue #26), which made a separate hackathons page
redundant. The page was removed in issue #54. The data and styling it used stay in place because
the portfolio section uses them: `src/content/hackathons.ts`, `pageThemes.hackathons` in
`src/styles/themes.ts`, and the tint tokens in `src/styles/index.css`.

## What is here

The files keep their original paths under this folder:

| Archived path                                               | Original path                   |
| ----------------------------------------------------------- | ------------------------------- |
| `src/pages/Hackathons.tsx`                                  | `src/pages/Hackathons.tsx`      |
| `src/pages/HackathonDetail.tsx`                             | `src/pages/HackathonDetail.tsx` |
| `src/components/archive/` (components, helpers, unit tests) | `src/components/archive/`       |
| `e2e/archive.spec.ts`                                       | `e2e/archive.spec.ts`           |

The tag `archive/hackathons-page` (commit `0ffef02`) points at the last `v2` commit before the
page was removed, with everything wired up and passing. To look at that version:

```bash
git show refs/tags/archive/hackathons-page:src/App.tsx
git switch --detach refs/tags/archive/hackathons-page
```

## How to restore it

Run these from the repo root, on a branch.

1. Move the files back. `git mv` keeps their history.

   ```bash
   git mv archive/hackathons-page/src/pages/Hackathons.tsx src/pages/Hackathons.tsx
   git mv archive/hackathons-page/src/pages/HackathonDetail.tsx src/pages/HackathonDetail.tsx
   git mv archive/hackathons-page/src/components/archive src/components/archive
   git mv archive/hackathons-page/e2e/archive.spec.ts e2e/archive.spec.ts
   ```

2. Add the two routes back in `src/App.tsx`, inside the `<Layout />` route, before the
   `portfolio` routes:

   ```tsx
   import { HackathonDetail } from "./pages/HackathonDetail";
   import { Hackathons } from "./pages/Hackathons";

   <Route path="hackathons" element={<Hackathons />} />
   <Route path="hackathons/:slug" element={<HackathonDetail />} />
   ```

3. In `src/content/site.ts`, put back the Hackathons item at the start of `navLinks` and the
   `hackathons` entry in `pagePrompts` (`Hackathons.tsx` reads it), exactly as they were at the
   tag:

   ```bash
   git diff refs/tags/archive/hackathons-page -- src/content/site.ts
   ```

4. Put back the tests and lab demo that covered the page. Compare each with the tag and restore
   the `/hackathons` parts: the two `/hackathons` entries in the smoke routes, the hackathons
   cards in the Motion Lab, and the motion spec's hackathons list, routes, and accent colors.
   Remove the smoke tests that expect `/hackathons` to show the 404 page and the nav to have no
   Hackathons link.

   ```bash
   git diff refs/tags/archive/hackathons-page -- e2e/smoke.spec.ts e2e/motion.spec.ts src/pages/lab/MotionLab.tsx
   ```

5. Remove the excludes that keep tools off `archive/`. If other code is still archived under
   `archive/`, keep them. Leave no import behind that nothing uses: `tsc` fails on one.
   - `vite.config.ts`: remove only the `"archive/**"` item, so the line reads
     `exclude: [...configDefaults.exclude],`, and remove the comment above it. Keep the
     `configDefaults` import: the line still uses it.
   - `.oxlintrc.json`: the `archive/**` entry in `ignorePatterns` (remove the key if it is then
     empty).
   - `.prettierignore`: the `archive` line and the comment above it.
   - `src/pages/pages.test.ts`: remove the whole `archive/ is outside every tool` block, and with
     it the `// @vitest-environment node` line and the imports only that block used
     (`execFileSync`, `resolve`, `getFileInfo`, `ts`). Keep `readdirSync`, `readFileSync` and the
     vitest imports. `git diff refs/tags/archive/hackathons-page -- src/pages/pages.test.ts`
     shows exactly what was added.
   - `src/styles/index.css`: the `@source not "../../archive";` line, if one was added.

6. Delete this folder once it is empty, then run `npm run check` and `npm run test:e2e`.
