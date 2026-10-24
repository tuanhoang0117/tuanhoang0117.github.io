#!/usr/bin/env bash
# Runs one command as the tuanhoang-bot GitHub account, which every agent uses.
#
#   scripts/as-bot.sh git commit -m "..."
#   scripts/as-bot.sh git push -u origin agent/1-pixel-engine
#   scripts/as-bot.sh gh pr create ...
#
# The token is read from macOS Keychain (service "gh-agent-token") into the environment of this
# one command. It is never printed and never passed as a command-line argument.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: scripts/as-bot.sh <command> [args...]" >&2
  exit 2
fi

GH_TOKEN="$(security find-generic-password -s gh-agent-token -w)" || {
  echo "as-bot: no gh-agent-token in Keychain; see docs/agent-workflow.md" >&2
  exit 1
}
export GH_TOKEN

export GIT_AUTHOR_NAME="tuanhoang-bot"
export GIT_AUTHOR_EMAIL="347146905+tuanhoang-bot@users.noreply.github.com"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

if [ "$1" = "git" ]; then
  shift
  # The credential helper reads GH_TOKEN from the environment, so the token stays out of argv.
  exec git -c credential.helper= \
    -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f' \
    "$@"
fi

exec "$@"
