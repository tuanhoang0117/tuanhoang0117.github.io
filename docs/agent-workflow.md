# Agent workflow

How work gets from an idea to the live site. The short version: **agents build, agents check, a
human decides.** GitHub enforces the last part, so it doesn't depend on anyone remembering a rule.

## Roles

| Role          | Who                                                     | Does                                                                           | Can't                                         |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Product owner | Tuan                                                    | Approves issues, judges how things look, approves and merges every PR          | Merge without green CI (admins are bound too) |
| Lead          | Claude Code (main session)                              | Writes issues and contracts, dispatches agents, owns shared files, runs retros | Merge, or push to `v2` / `main`               |
| Engineer      | [`engineer`](../.claude/agents/engineer.md) agent, Opus | Builds one issue in its own worktree and opens a PR                            | Touch files outside its issue, merge          |
| QA            | [`qa`](../.claude/agents/qa.md) agent, Sonnet           | Re-runs every test on a clean checkout, posts screenshots at desktop and 375px | Edit code, judge taste                        |
| Reviewer      | [`reviewer`](../.claude/agents/reviewer.md) agent, Opus | Verifies each criterion itself, breaks a test on purpose, posts a verdict      | Edit code, approve, merge, judge taste        |

The reviewer's rules were set by the product owner. Engineers and reviewers get the strongest model
because building and judging are where depth matters. QA is mechanical, so it runs on a faster model.

## The path of one issue

```text
Issue (#N, "status: ready")
  │  lead dispatches an engineer into an isolated git worktree
  ▼
Engineer ── branch agent/N-slug from v2 ── build ── tests seen failing ── PR into v2
  │                                                                         │
  │                                          CI: lint, format, typecheck, unit, e2e + axe
  ▼                                                                         ▼
QA ── clean checkout ── all tests ── screenshots ──► PR comment
Reviewer ── verify criteria ── break a test ── verdict ──► PR comment
  │
  ▼
Tuan ── screenshots + review ── Approve ── Merge  (GitHub blocks merge without CI + his approval)
```

Several issues run this path at once. They stay out of each other's way because:

- **File ownership.** Each issue lists the only files it may change (see `CLAUDE.md`).
- **Contracts.** Shared types in `src/**/types.ts` are lead-owned, so agents build against a fixed
  interface.
- **Pre-registered routes.** The lead adds every route before issues go out, so no agent edits
  `App.tsx`.
- **Separate ports.** Each agent runs its test server on its own port.

## The bot account

Every agent acts on GitHub as **`tuanhoang-bot`**, a separate machine account with write access to
this repo only. This does three things:

1. **Author and approver are different people.** GitHub won't let anyone approve their own PR. Bot
   authorship means Tuan's approval is a real, recorded approval.
2. **Agents never hold the owner's login,** which can change settings and reach every repo. If the
   bot's token leaked, revoking it would affect nothing else.
3. **Automation is labeled.** Anyone can see which work came from agents.

[`scripts/as-bot.sh`](../scripts/as-bot.sh) runs a single `git` or `gh` command as the bot. It reads
the token from macOS Keychain into that command's environment, so the token is never printed and
never appears in a command line.

## Guardrails GitHub enforces

On `v2`:

- Changes only through PRs. Nobody pushes directly, including the lead and the owner.
- Both CI jobs must pass, against the latest `v2`.
- One approval from the code owner (Tuan, via [`CODEOWNERS`](../.github/CODEOWNERS)). The bot's
  approval doesn't count.
- New commits after an approval cancel it.

`main` (the live site) requires a PR and an approval. It gains the CI requirement at cutover.

## Screenshots

QA screenshots go to a separate `screenshots` branch (`pr-<number>/`) and are shown in the PR
comment. The images stay out of the code history but still render on GitHub.

## Learning loop

Every mistake that slips through becomes a rule in `CLAUDE.md` → "Lessons learned" at the sprint
retro, so the next sprint's agents start with it.
