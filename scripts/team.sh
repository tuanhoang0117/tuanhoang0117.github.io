#!/usr/bin/env bash
# Opens the Codex team in one tmux window: the lead on the left, one pane per agent on the right,
# each started with scripts/dispatch.sh (so each gets its own worktree and the credential guard).
#
#   scripts/team.sh reviewer:14 qa:16 reviewer:16             # lead + three agents
#   scripts/team.sh --no-lead reviewer:14                     # agents only (lead already open)
#
# Moving around: click a pane (mouse is on), or Ctrl-b then an arrow key. Ctrl-b z zooms the
# current pane in and out. Ctrl-b d detaches; everything keeps running, and `tmux attach -t team`
# brings it back. A pane stays open after its agent exits, so you can read the last output.
set -euo pipefail

usage() {
  echo "usage: scripts/team.sh [--no-lead] <role>:<number> ..." >&2
  echo "  roles: engineer (issue number), qa and reviewer (PR number)" >&2
  exit 2
}

lead=1
attach=1
agents=()
for arg in "$@"; do
  case "$arg" in
    --no-lead) lead=0 ;;
    --no-attach) attach=0 ;; # for testing: build the session without opening it
    engineer:* | qa:* | reviewer:*)
      [[ "${arg#*:}" =~ ^[0-9]+$ ]] || usage
      agents+=("$arg")
      ;;
    *) usage ;;
  esac
done
[ "$lead" = 1 ] || [ "${#agents[@]}" -gt 0 ] || usage

command -v tmux > /dev/null || {
  echo "team: tmux not found. Install it: brew install tmux" >&2
  exit 1
}
if tmux has-session -t team 2> /dev/null; then
  echo "team: a 'team' session already exists. Open it: tmux attach -t team" >&2
  echo "      or close it first: tmux kill-session -t team" >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
cmds=()
[ "$lead" = 1 ] && cmds+=("scripts/dispatch.sh lead")
for a in "${agents[@]+"${agents[@]}"}"; do
  cmds+=("scripts/dispatch.sh ${a%%:*} ${a#*:}")
done

# Each pane reports how its agent exited, so a failed start is visible instead of a blank pane.
# Agents start a few seconds apart, so their fetches and Codex startups don't collide.
pane_cmd() {
  printf 'sleep %d; %s; s=$?; echo; echo "[%s exited with status $s; Codex errors, if any, are in its .agent-scratch/codex-stderr.log]"' \
    "$(($1 * 4))" "$2" "${2#scripts/dispatch.sh }"
}

tmux new-session -d -s team -c "$root" -x 240 -y 60 "$(pane_cmd 0 "${cmds[0]}")"
tmux set-option -t team remain-on-exit on
tmux set-option -t team mouse on
tmux set-option -t team pane-border-status top
tmux select-pane -t team -T "${cmds[0]#scripts/dispatch.sh }"
i=0
for cmd in "${cmds[@]:1}"; do
  i=$((i + 1))
  tmux split-window -t team -c "$root" "$(pane_cmd "$i" "$cmd")"
  tmux select-pane -t team -T "${cmd#scripts/dispatch.sh }"
  tmux select-layout -t team main-vertical
done
tmux select-pane -t team.0

[ "$attach" = 1 ] || exit 0
if [ -n "${TMUX:-}" ]; then
  tmux switch-client -t team
else
  tmux attach -t team
fi
