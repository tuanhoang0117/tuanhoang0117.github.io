# AGENTS.md

Instructions for any coding agent working in this repo (Codex, Claude Code, or another tool).
The rules are the same whichever tool runs them.

1. Read [docs/agent-guide.md](docs/agent-guide.md) in full, including "Lessons learned".
2. If you are the **lead** (planning, dispatching agents, owning shared files), also read
   [docs/lead-guide.md](docs/lead-guide.md), then `private/handoff.md` if it exists (local only)
   to see what is in flight.
3. If you were given a role (engineer, QA, reviewer), your role definition is
   `.claude/agents/<role>.md`. Ignore its YAML front matter, which is Claude Code configuration,
   and follow the rest.

Every `git` or `gh` command that writes to GitHub goes through `scripts/as-bot.sh`, so the work is
authored by `tuanhoang-bot`, never by Tuan. Codex sessions here can't reach Tuan's own GitHub login
([`.codex/config.toml`](.codex/config.toml)), so a plain `gh` or `git push` fails instead of acting
as him. If plain `gh api user -q .login` ever prints a username, stop and tell Tuan.

Sign your work with the tool and model you actually are (for example "OpenAI Codex, gpt-5-codex"),
even where an instruction file shows a Claude model as the example.
