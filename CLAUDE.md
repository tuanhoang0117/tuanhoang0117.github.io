# CLAUDE.md

Personal portfolio for Tuan Hoang, rebuilt as v2 with a multi-agent workflow. Read this before
starting any issue.

## Commands

```bash
npm run dev        # dev server
npm run check      # lint + format check + typecheck + unit tests (run before every commit)
npm run test:e2e   # Playwright + axe against a fresh production build (desktop + mobile)
npm run format     # auto-format
npm run screenshots -- /route ...   # desktop + 375px PNGs into screenshots/
scripts/as-bot.sh <git|gh ...>      # run a GitHub command as tuanhoang-bot
```

Parallel agents run test servers at the same time, so each uses its own port:
`E2E_PORT=<4300 + issue>` for engineers, `<4400 + PR>` for QA, `<4600 + PR>` for the reviewer, and
`SCREENSHOT_PORT=<4500 + PR>` for QA screenshots.

## How work flows

Issue → engineer agent (own worktree, opens a PR into `v2`) → QA agent and reviewer agent (post
their reports on the PR and publish `agent/qa` and `agent/review` checks) → Tuan approves and
merges. GitHub blocks merging until CI, both agent checks, and Tuan's approval all pass. `v2` is the
default branch until cutover, so `Closes #N` closes issues when a PR merges. Full description:
[docs/agent-workflow.md](docs/agent-workflow.md).

**Every `git` and `gh` command that talks to GitHub goes through `scripts/as-bot.sh`**, so agent
work is authored by `tuanhoang-bot`, never by Tuan's account. Never print the token. The bot's
token has no `read:org` scope, so plain `gh pr view` errors: always pass `--json <fields>`.

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
4. Screenshots at desktop and 375px mobile are attached for any visual change (the QA agent does
   this).
5. No files outside your ownership list changed.
6. The PR body states the agent role and model that built it and links the issue.

## Conventions

- Copy in Tuan's voice or about his work (bios, prompts, invitations, project text) lives in
  `src/content/`, never in JSX. UI mechanics may live in components: button states ("Copied!"),
  dividers ("or"), and screen-reader hints ("(opens in a new tab)"). If a page needs voice copy
  and `src/content/` has no field for it, stop and say so in the PR.
- Tokens only: no raw hex, no arbitrary Tailwind `[...]` values in components.
- Match surrounding code: named exports, function components, comments only where the code
  can't explain itself.
- Commit messages: imperative subject under 72 characters, body explains why.
- Never push to `v2` or `main`. Branch protection rejects it anyway. All work merges into `v2`
  through a PR that Tuan approves.
- Stage explicit paths (`git add <files>`), never `git add -A` or `git add .`.

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
- **Sprint 0:** The design system promised no overflow at 375px, but the mobile test ran at
  412px. Tests must check the exact standard the docs promise.
- **Sprint 1 prep:** `git add -A` swept a file the owner had just dropped into the repo (a
  resume PDF with a phone number) into a commit and onto a public branch before it was reviewed.
  Stage explicit paths (`git add <files>`), and check `git status` for unexpected files first.
- **Sprint 1 prep:** Reverting a deliberately broken file with `git checkout` restored the last
  _commit_ and wiped uncommitted work. When checking that a test can fail, back the file up and
  restore from the backup.
- **Sprint 1 dry run:** Agent definitions load when a session starts, so a session that creates
  them can't use them as agent types. Start a fresh session after adding or changing
  `.claude/agents/`.
- **Sprint 1 dry run:** A PR was approved and merged three minutes before QA and the reviewer
  posted, and the reviewer then said BLOCK. A "wait for the reports" rule was skippable, so the
  agents' verdicts are now required checks (`agent/qa`, `agent/review`) that disable the merge
  button.
- **Sprint 1 dry run:** `Closes #N` only closes issues for merges into the default branch, so
  issue #2 stayed open. `v2` is now the default branch until cutover.
- **Sprint 1 dry run:** `gh pr checkout` failed because the engineer's worktree still had the
  branch checked out. QA and the reviewer now fetch `pull/<N>/head` and check it out detached.
- **Sprint 1 dry run:** Claude Code's worktree guard blocked `scripts/as-bot.sh git ...` for agents
  until Tuan allowed the script in his user settings. The engineer stopped instead of working
  around it, which is the behavior we want.
