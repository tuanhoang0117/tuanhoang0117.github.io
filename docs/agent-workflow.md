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
QA ── clean checkout ── all tests ── screenshots ──► PR comment + agent/qa check
Reviewer ── verify criteria ── break a test ── verdict ──► PR comment + agent/review check
  │
  ▼
Tuan ── screenshots + review ── Approve ── Merge  (GitHub blocks merge without CI, both agent checks, and his approval)
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
- Both agent checks must pass: `agent/qa` (QA's PASS/FAIL) and `agent/review` (the reviewer's
  verdict; BLOCK fails). The agents publish them as commit statuses on the exact commit they
  tested, so a new push resets them and the agents run again. This was added after the first dry
  run, when a PR was merged minutes before its reviewer said BLOCK.
- One approval from the code owner (Tuan, via [`CODEOWNERS`](../.github/CODEOWNERS)). The bot's
  approval doesn't count.
- New commits after an approval cancel it.

Branches must be **up to date** with `v2` before merging. When one PR merges, every other open PR
must update, and both agents check it again, because what they approved is no longer what would
merge. It costs a few minutes of agent time per PR, and it catches two PRs that pass separately and
break together. Tuan chose quality over speed here.

### Overriding a BLOCK

If Tuan disagrees with the reviewer, he posts `agent/review: success` himself, from his own
account, with the reason in the description:

```bash
gh api repos/tuanhoang0117/tuanhoang0117.github.io/statuses/<sha> \
  -f state=success -f context=agent/review -f description="Override by Tuan: <reason>"
```

GitHub records who posted every status, so the history shows the override and its reason. A human
can always overrule an agent, and the overrule is never silent.

### Known limitation

Every agent role uses the same bot token, so GitHub can't tell QA, the reviewer, and an engineer
apart. An engineer agent could technically post `agent/review: success` on its own PR. The
engineer's instructions forbid it, but that's a rule, not enforcement. The checks reliably stop
**honest mistakes** (like merging before the reviews exist), not a misbehaving agent. Tuan's
required code-owner approval is the real backstop. The full fix is a separate identity per role (a
GitHub App per agent), so the required checks can be pinned to the reviewer's identity alone.

`main` (the live site) requires a PR and an approval. It gains the CI requirement at cutover.
Until then `v2` is the repo's default branch, so `Closes #N` in a PR closes its issue on merge.
GitHub Pages still publishes from `main`.

## Screenshots

QA screenshots go to a separate `screenshots` branch (`pr-<number>/`) and are shown in the PR
comment. The images stay out of the code history but still render on GitHub.

## Learning loop

Every mistake that slips through becomes a rule in `CLAUDE.md` → "Lessons learned" at the sprint
retro, so the next sprint's agents start with it.
