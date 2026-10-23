# CLAUDE.md

Personal portfolio for Tuan Hoang, rebuilt as v2 with a multi-agent workflow. Read this before
starting any issue.

## Commands

```bash
npm run dev        # dev server
npm run check      # lint + format check + typecheck + unit tests (run before every commit)
npm run test:e2e   # Playwright + axe against a fresh production build (desktop + mobile)
npm run format     # auto-format
```

## Stack

React 19, Vite, TypeScript (strict), Tailwind CSS v4, React Router. Unit tests: Vitest + Testing
Library. E2E: Playwright + axe. Why: [docs/decisions/](docs/decisions/).

## Read before building

- [docs/design-system.md](docs/design-system.md): tokens and the six visual rules
- [docs/contracts/content-schema.md](docs/contracts/content-schema.md): content data rules
- [docs/contracts/sprite-format.md](docs/contracts/sprite-format.md): pixel art format
- [ADR 0002](docs/decisions/0002-no-scroll-gated-content.md): no scroll-gated content

## File ownership

Parallel agents stay out of each other's way by owning separate files. Your issue lists the files
you own; touch nothing else.

| Path                                                | Owner                                             |
| --------------------------------------------------- | ------------------------------------------------- |
| `src/styles/index.css` (tokens)                     | Lead only. Need a token? Say so in the PR.        |
| `src/content/types.ts`, `src/pixel/types.ts`        | Lead only. Contract changes get their own issue.  |
| `src/App.tsx` (routes)                              | Lead only. Routes are pre-registered.             |
| `src/components/shell/`, `src/components/ui/`       | Lead only, unless the issue says otherwise.       |
| `src/pages/<Page>.tsx`, `src/components/<feature>/` | The issue for that page or feature.               |
| `e2e/<feature>.spec.ts`                             | The issue for that feature. One file per feature. |

## Definition of done

A PR is ready for review only when all of these are true:

1. Every acceptance criterion in the issue is met. List them in the PR with how each was verified.
2. `npm run check` and `npm run test:e2e` pass locally, and CI is green.
3. New behavior has tests, and **each new test was seen failing** before the fix or against a
   deliberately broken version. A test that can't fail proves nothing.
4. Screenshots at desktop and 375px mobile are attached for any visual change.
5. No files outside your ownership list changed.
6. The PR body states the agent role and model that built it and links the issue.

## Conventions

- Components render from `src/content/` data. No hard-coded project copy in JSX.
- Tokens only: no raw hex, no arbitrary Tailwind `[...]` values in components.
- Match surrounding code: named exports, function components, comments only where the code
  can't explain itself.
- Commit messages: imperative subject under 72 characters, body explains why.
- Never push to `main`. All work merges into `v2` through a reviewed PR.

## Lessons learned

Updated at each sprint retro. Each entry is a mistake that happened once and a rule that
prevents it.

- **Sprint 0:** Playwright reused an already-running server and tested a stale build, so a broken
  build "passed." E2E now always builds fresh on a dedicated port.
- **Sprint 0:** `body { overflow-x: hidden }` hid horizontal overflow from the overflow test. Fix
  overflow at its source; never hide it globally.
- **Sprint 0:** A fake bug (a zero-height wide div) didn't trigger overflow, so "the test passes"
  briefly looked like a broken test. When checking that a test can fail, make sure the injected
  bug is real.
