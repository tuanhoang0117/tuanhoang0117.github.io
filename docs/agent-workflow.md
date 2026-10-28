# Agent workflow

How work gets from an idea to the live site. The short version: **agents build, agents check, a
human decides.** GitHub enforces the last part, so it doesn't depend on anyone remembering a rule.

## Roles

| Role          | Who                                                     | Does                                                                           | Can't                                         |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Product owner | Tuan                                                    | Approves issues, judges how things look, approves and merges every PR          | Merge without green CI (admins are bound too) |
| Lead          | Claude Code or Codex (main session)                     | Writes issues and contracts, dispatches agents, owns shared files, runs retros | Merge, or push to `v2` / `main`               |
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

- **File ownership.** Each issue lists the only files it may change (see [agent-guide.md](agent-guide.md)).
- **Contracts.** Shared types in `src/**/types.ts` are lead-owned, so agents build against a fixed
  interface.
- **Pre-registered routes.** The lead adds every route before issues go out, so no agent edits
  `App.tsx`.
- **Separate ports.** Each agent runs its test server on its own port.

## How much checking a PR gets

Adopted by Tuan on 2026-10-27, after one home-page PR took six QA rounds and five reviews. Most
of those re-runs checked a design that changed again afterwards, and QA and the reviewer each ran
the same full suite that CI runs anyway. The agents still catch real bugs (two keyboard bugs in the
menu, the banner covering content), so the checks stay but are sized to the risk.

1. **Tuan sees it first.** Before any QA or review, the lead shows Tuan a screenshot or the running
   dev server and he confirms the design. Agents never check a design that isn't settled.
2. **Checks match the risk.** The lead labels each PR's tier in its body:
   - **Low:** docs, icons and assets, copy, config, test-only changes. CI plus Tuan's approval; no
     agents. The lead posts both agent statuses as `"Not needed: low risk (<why>)"` with a PR
     comment saying so.
   - **Medium:** one visual component or a contained change. One combined agent reviews the diff,
     makes deliberate breaks and checks the page in a real browser, then posts both statuses.
   - **High:** interaction, keyboard and accessibility, layout across screen sizes, physics,
     anything shared by many pages. Separate QA and reviewer, as before.
3. **Agents don't re-run the whole suite.** CI runs every test on every push. Agents run
   `npm run check` and only the e2e specs for the files that changed, and spend their effort on
   judgment: the diff, deliberate breaks, and real-browser checks.
4. **Re-checks cover only what changed.** After a fix, the reviewer reviews the fix commit (and
   QA re-tests only the affected behavior) instead of the whole PR. A v2 merge that leaves the PR's
   own files unchanged carries the verdicts forward with a disclosure comment (automated by #60).
5. **A cheaper model for QA.** QA is mostly mechanical; it runs on a smaller model. Reviews keep
   the stronger one.
6. **Split by risk, bundle the rest.** Put a risky piece (like the menu) in its own PR so its
   checks stay focused. Bundle small low-risk changes into one PR, since every agent run has a fixed
   start-up cost.

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

Plain `gh` on this machine is logged in as Tuan, and plain `git push` uses his Keychain
credential, so an agent that forgot the script would act under his name, and its status could look
like a real override. [`.claude/settings.json`](../.claude/settings.json) prevents that for every
Claude Code session and subagent in this repo: it points `gh` at an empty config directory and
clears git's credential helper. Plain `gh` then says "gh auth login" and plain `git push` can't
authenticate, while `as-bot.sh` brings its own token and works. This also applies to Tuan's own `!`
commands inside Claude Code, so he runs owner commands (like overrides) from a normal terminal.

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
must update. CI re-runs on the updated branch, which catches two PRs that pass separately and break
together. If the PR's own files are unchanged, the agents' verdicts carry forward with a
disclosure comment; otherwise the changed part is checked again (see "How much checking a PR
gets").

### Overriding a gate

Tuan can overrule either agent from his own account, in a normal terminal (not inside Claude Code,
where his credentials are hidden). First get the PR's current head commit:

```bash
gh pr view <N> --json headRefOid -q .headRefOid
```

Then post the status for that `<sha>`, with the reason in the description:

```bash
# Overrule a reviewer BLOCK
gh api repos/tuanhoang0117/tuanhoang0117.github.io/statuses/<sha> \
  -f state=success -f context=agent/review -f description="Override by Tuan: <reason>"

# Overrule a QA FAIL (for example, a flaky test he has checked himself)
gh api repos/tuanhoang0117/tuanhoang0117.github.io/statuses/<sha> \
  -f state=success -f context=agent/qa -f description="Override by Tuan: <reason>"
```

**PRs no agent will run on** (an emergency fix, or the bot token has expired): post both
statuses the same way, with a description saying why no agent ran, for example
`"No agent run: bot token expired; Tuan tested locally"`.

An override applies only to that `<sha>`. A new push resets both checks.

GitHub records who posted every status, so the history shows the override and its reason. A human
can always overrule an agent, and the overrule is never silent. To see the whole history, including
anything an override replaced:

```bash
gh api repos/tuanhoang0117/tuanhoang0117.github.io/commits/<sha>/statuses \
  -q '.[] | [.created_at, .context, .state, .creator.login, .description] | @tsv'
```

### Known limitations

- **The credential guard is not a security boundary.** It stops an agent that forgets
  `scripts/as-bot.sh`; an agent can deliberately unset its environment variables. Instructions,
  bot-authored history, required checks, and Tuan's approval remain the safeguards against a
  deliberate bypass.
- **One bot token for every role.** The lead, engineers, QA, and the reviewer all act as
  `tuanhoang-bot`, so GitHub can't tell them apart. An engineer could technically post
  `agent/review: success` on its own PR, and so could the lead. The instructions forbid it, but
  that's a rule, not enforcement.
- **A later status silently replaces an earlier one.** GitHub's check shows only the newest status
  per context. If the bot posts `success` after a reviewer's BLOCK, the merge button turns on and
  the BLOCK survives only in the status history (command above) and the review comment.
- **Pinning would end Tuan's override.** The full fix is a separate identity per role (a GitHub App
  per agent), with each required check pinned to its app. Once pinned, a status Tuan posts from his
  user account no longer satisfies the check, so overrides would need a new path, such as
  temporarily lifting the requirement or a dedicated override app.

The checks reliably stop **honest mistakes** (like merging before the reviews exist), not a
misbehaving agent. Tuan's required code-owner approval, given after reading the review comments,
is the real backstop.

`main` (the live site) requires a PR and an approval. It gains the CI requirement at cutover.
Until then `v2` is the repo's default branch, so `Closes #N` in a PR closes its issue on merge.
GitHub Pages still publishes from `main`.

## Switching tools

The team can run on Claude Code or OpenAI Codex, and a sprint can move between them mid-way, for
example when one tool hits its usage limit. Everything a session needs to continue lives outside
any one tool:

- **Rules:** [`AGENTS.md`](../AGENTS.md) (read by Codex and other tools) and the local CLAUDE.md
  (Claude Code) both point to the [agent guide](agent-guide.md) and [lead guide](lead-guide.md).
- **State:** GitHub is the source of truth. The lead also keeps a local handoff note
  (`private/handoff.md`) with what's in flight and what's waiting on Tuan.
- **Dispatching:** either lead runs agents in the background and Tuan talks only to the lead.
  Claude Code uses its Agent tool with worktree isolation. Codex uses its built-in subagents, each
  in a worktree created by [`scripts/dispatch.sh`](../scripts/dispatch.sh) `--no-launch`.
  [`scripts/team.sh`](../scripts/team.sh) is a fallback that opens agents as separate terminal
  sessions in tmux.
- **Credential guard:** `.claude/settings.json` (Claude Code) and
  [`.codex/config.toml`](../.codex/config.toml) (Codex) set the same variables, so plain `gh` and
  `git push` fail in both and only `scripts/as-bot.sh` reaches GitHub.
- **Stopped agents:** never resume one. Its worktree may have been cleaned up, causing the resumed
  session to run in the lead's checkout. Dispatch a new agent with a fresh worktree instead.

Only one lead runs at a time, and every PR and review names the tool and model that produced it.

## Screenshots

QA screenshots go to a separate `screenshots` branch (`pr-<number>/`) and are shown in the PR
comment. The images stay out of the code history but still render on GitHub.

## Learning loop

Every mistake that slips through becomes a rule in [agent-guide.md](agent-guide.md) → "Lessons learned" at the sprint
retro, so the next sprint's agents start with it.
