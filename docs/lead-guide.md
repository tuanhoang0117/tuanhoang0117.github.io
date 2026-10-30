# Lead guide

How to run this project as the lead: the main session that plans work, dispatches agents, owns
shared files, and reports to Tuan. Any tool can be the lead. When one tool hits its usage limit,
another picks up from this guide and the handoff note, so nothing the lead knows may live only in
one tool's memory.

Read [agent-guide.md](agent-guide.md) and [agent-workflow.md](agent-workflow.md) first.

## The project

Tuan Hoang's portfolio, rebuilt as v2 in the style of quackhacks.org's story, quackpost, and signup
pages, with a pixel / digital-rendering look as a first-class part of the design. The bar is "same
quality as QuackHacks." Light theme only. No scroll-gated content
([ADR 0002](decisions/0002-no-scroll-gated-content.md)). Pixel art is drawn in code
([ADR 0003](decisions/0003-code-rendered-pixel-art.md)).

The process is part of the portfolio. Recruiters should see disciplined agentic engineering:
issues with testable criteria, agents in isolated worktrees, PRs with test evidence, independent
review, visible human approval, honest AI attribution, and sprint retros.

Tuan is learning to run a multi-agent team. Explain decisions as you make them, give him a
recommendation rather than a list, and push ideas and opinions.

## Starting a session

1. Read `private/handoff.md` (local only). It says what is in flight and what is waiting on Tuan.
2. Check that against GitHub, which is the source of truth: open issues and PRs, and each PR's
   `agent/qa` and `agent/review` statuses.
3. Tell Tuan in a few lines where things stand and what you plan to do next.

## Ending a session (or before a usage limit)

Update `private/handoff.md` so the next lead, possibly a different tool, can continue without
asking Tuan anything:

- Every open issue and PR with its state: who is working on it, which checks have passed, what is
  waiting on Tuan.
- Every agent still running or stopped mid-task, its worktree, and where it stopped.
- Decisions Tuan made this session that aren't recorded on GitHub yet.
- The next three things to do.

Agents follow the same rule: before stopping for any reason, they push their work or comment on
the issue or PR saying exactly where they stopped.

## Dispatching agents

- **Claude Code:** the Agent tool with the `engineer`, `qa`, or `reviewer` type and
  `isolation: worktree`. QA and reviewers can't fetch a PR under the worktree guard, so for them
  the lead prepares the worktree with `scripts/dispatch.sh <role> <number> --no-launch` (Tuan's
  decision, 2026-10-29) and spawns the agent without `isolation`, with the Codex rule below: every
  command runs inside that worktree, and the agent runs no git command that changes state.
- **Codex:** built-in subagents (up to three at once), which run in the background and report back
  to the lead, like Claude's. They share the lead's folder, so give each one a worktree first:
  `scripts/dispatch.sh <role> <number> --no-launch` creates it (checked against the PR's head on
  GitHub) and prints the agent's prompt. Spawn the subagent with that prompt and this rule: run
  every command inside its worktree (`cd <worktree> && ...` or `git -C <worktree>`), and never
  touch the main checkout or another agent's worktree. The guard comes from `.codex/config.toml`
  and reaches subagents (verified). Approvals for subagents surface in the lead's chat.
- **Fallback, any CLI tool:** Tuan runs `scripts/dispatch.sh <role> <number>` in a terminal tab per
  agent, or `scripts/team.sh [--no-lead] reviewer:14 qa:16 ...` for several in one tmux window.
  Those agents report on GitHub only, so the lead reads their results there.

In every tool, Tuan talks only to the lead. He shouldn't have to start or approve agents one by one
unless he chooses the fallback.

Give every agent its own port (see the agent guide) and its own scratch folder. Never resume an
agent that has stopped: its worktree may be gone. Start a new one.

**Never run two leads at once**, and never put two agents on the same PR role. Two reviewers on
one PR race for the same `agent/review` check.

## Rules Tuan has set

- **Git.** Never push to `main` or `v2`, and never merge or approve; Tuan does that. Feature and
  lead branches may be pushed and PRs opened without asking. All work goes through bot-authored
  PRs.
- **No Co-Authored-By trailers** on commits in this repo, even if your tool adds them by default.
  PR bodies may carry a tool footer.
- **Public actions.** The repo is public. Ask before creating issues or anything else public,
  except what Tuan has already asked for.
- **Content.** Site copy lives in `src/content/` and is lead-owned. Before writing or changing any
  copy, read `private/content-facts.md` (local only, never commit it or quote it in public): it
  lists what the site may and may not claim. Never overstate Tuan's work.
- **Never route around a guard.** If a tool, permission, or credential guard refuses something,
  stop and ask Tuan. Don't do it another way, and don't do it for an agent that was refused.
- **Check agents' work before acting on it.** Agent reports are claims. Before committing for an
  agent or relaying a result, look at the files, statuses, and messages yourself.
- **Approvals.** Remind Tuan to write a sentence in his PR approvals. His answers to reviewers'
  questions belong there, on the record.

## Lead lessons

- **Sprint 1:** Claude Code's worktree guard refuses `scripts/as-bot.sh git ...` for isolated
  agents, so Claude engineers stop at commit. Until that's fixed, the lead commits their staged
  work from the main session (Tuan's decision), after checking the files and message, and says so
  in the PR.
- **Sprint 2:** The same guard refused the isolated QA agent and reviewer on #88 at
  `as-bot.sh git fetch`, so neither could check out the PR. Both stopped instead of working around
  it, and the lead didn't fetch for them. Tuan then allowed lead-prepared checkouts (see
  Dispatching agents).
- **Sprint 2:** #80's "never covers a page title" test measured the title mid-entrance, while it
  was still sliding up from below, so it passed against a real 3px overlap and failed about 1 run
  in 9. Layout tests measure after `document.getAnimations()` have finished.
- **Sprint 1:** Two engineers wrote commit messages to the same fixed scratch file, and one
  overwrote the other. Agents use `mktemp` files and per-agent scratch folders.
- **Sprint 1:** A reviewer's deliberate break was silently refused, so its "failing" run tested
  unmodified code. Confirm a break landed (`git diff` or `cmp`) before trusting the result.
- **Sprint 1:** Three Codex agents started at the same moment each fetched their PR into git's
  shared `FETCH_HEAD`, so two of them checked out another PR's code. `dispatch.sh` now fetches
  into a ref per agent and refuses to start unless the checkout matches the PR's head on GitHub.
  Anything agents run in parallel needs its own file, ref, or port.
- **Sprint 1:** A usage limit stopped a reviewer mid-review with no status posted. The required
  check kept the PR unmergeable, which is the gate working. Start a fresh reviewer; don't trust a
  partial one.
- **Sprint 2:** The big one-shot jobs (the portfolio rework, the home page) ran longest, drew the
  biggest reviews, and surfaced problems late: a blank gap inside a card appeared only after the
  whole page was built and QA'd. Break work down before dispatching it (Tuan's standing rule). One
  job is one PR on one theme, roughly 5 to 8 files, a few hundred lines, and about an hour of
  agent work, with testable criteria written first. Split along the seams: the lead's data and
  contract change first, then one component per job with its own tests, then the page assembled
  from merged components, then polish. Show Tuan a first slice (a screenshot) early. Small PRs
  mean more QA and review rounds and more branch updates, so stack dependent PRs, keep to three
  agents at a time, and carry verdicts forward when only a `v2` merge changed (Tuan decides each
  time).
- **Sprint 2:** One home-page PR took six QA rounds and five reviews, mostly re-checking designs
  that changed afterwards, while QA and the reviewer each re-ran the suite CI already runs. Show
  Tuan the design before any agent checks it, and size the checks to the risk
  ([agent-workflow.md → How much checking a PR gets](agent-workflow.md)).
