#!/usr/bin/env bash
# Starts one Codex agent in its own git worktree, with the role prompt and the credential guard.
# This is the Codex equivalent of the Claude Code lead's Agent tool. Run one per terminal tab.
#
#   scripts/dispatch.sh lead                # the lead, in the main checkout
#   scripts/dispatch.sh engineer 9          # issue number
#   scripts/dispatch.sh qa 14               # PR number
#   scripts/dispatch.sh reviewer 14         # PR number
#   scripts/dispatch.sh reviewer 14 --no-launch   # set up and print the prompt, don't start Codex
#
# The guard hides Tuan's GitHub login from the agent, as .claude/settings.json does for Claude
# Code: plain gh and git push fail, and only scripts/as-bot.sh can reach GitHub.
set -euo pipefail

usage() {
  echo "usage: scripts/dispatch.sh lead | <engineer|qa|reviewer> <number> [--no-launch]" >&2
  exit 2
}

role="${1:-}"
case "$role" in
  lead) n="" ; flag="${2:-}" ;;
  engineer | qa | reviewer) n="${2:-}" ; flag="${3:-}" ;;
  *) usage ;;
esac
[ "$role" = lead ] || [[ "$n" =~ ^[0-9]+$ ]] || usage
case "$flag" in "" | --no-launch) ;; *) usage ;; esac

export GH_CONFIG_DIR=/var/empty
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=
export GIT_TERMINAL_PROMPT=0

root="$(git rev-parse --show-toplevel)"
tracker="the issue or PR"

if [ "$role" = lead ]; then
  dir="$root"
  setup="You are in the main checkout. Start by following docs/lead-guide.md → Starting a session."
else
  dir="$root/.worktrees/$role-$n"
  if [ -e "$dir" ]; then
    echo "dispatch: $dir already exists. Remove it first: git worktree remove $dir" >&2
    exit 1
  fi
  # The repo is public, so these fetches need no credentials.
  git -C "$root" fetch -q origin
  if [ "$role" = engineer ]; then
    git -C "$root" worktree add -q --detach "$dir" origin/v2
    tracker="issue #$n"
    ports="E2E_PORT=$((4300 + n))"
    setup="Your worktree is $dir, detached at origin/v2 (already fetched). Create your branch with step 4 of your role definition and skip its fetch."
  else
    # Fetch into a ref of our own, not FETCH_HEAD: agents started together share FETCH_HEAD, and
    # one would check out another's PR. Then confirm it is the PR's current head on GitHub.
    ref="refs/dispatch/$role-$n"
    git -C "$root" fetch -q origin "+pull/$n/head:$ref"
    got="$(git -C "$root" rev-parse "$ref")"
    want="$("$root/scripts/as-bot.sh" gh pr view "$n" --json headRefOid -q .headRefOid)"
    if [ "$got" != "$want" ]; then
      echo "dispatch: fetched $got for PR #$n, but GitHub says its head is $want. Not starting." >&2
      exit 1
    fi
    git -C "$root" worktree add -q --detach "$dir" "$ref"
    tracker="PR #$n"
    if [ "$role" = qa ]; then
      ports="E2E_PORT=$((4400 + n)) and SCREENSHOT_PORT=$((4500 + n))"
    else
      ports="E2E_PORT=$((4600 + n))"
    fi
    setup="Your worktree is $dir, with the head of PR #$n checked out detached (sha $(git -C "$dir" rev-parse HEAD)). Skip the fetch and checkout step."
  fi
  setup="$setup Use $ports. Keep scratch files and backups in $dir/.agent-scratch/."
fi

prompt="You are the $role for Tuan Hoang's portfolio${n:+, working on $tracker}, running in OpenAI Codex.

Read $root/AGENTS.md first and follow it. Your worktree may predate it, so read any doc it names
from your worktree if it's there, otherwise from $root. $setup

Before anything else, prove the credential guard: run \`gh api user -q .login\`, which must fail,
then \`scripts/as-bot.sh gh api user -q .login\`, which must print tuanhoang-bot. If the first
prints anything else, stop and tell Tuan.

Write PR bodies, comments, and reports to fresh mktemp files. Before you stop for any reason
(done, blocked, or near a usage limit), push your work or comment on $tracker saying exactly
where you stopped."

if [ "$flag" = --no-launch ]; then
  printf 'dir: %s\n\n%s\n' "$dir" "$prompt"
  exit 0
fi

command -v codex > /dev/null || {
  echo "dispatch: codex not found. Install it: npm install -g @openai/codex" >&2
  exit 1
}
cd "$dir"
# Codex's error output goes to a log, so a crash at startup can't vanish with the screen.
log="$dir/.agent-scratch/codex-stderr.log"
mkdir -p "${log%/*}"
echo "dispatch: starting Codex as $role${n:+ $n} in $dir (errors: $log)"
exec codex "$prompt" 2>> "$log"
