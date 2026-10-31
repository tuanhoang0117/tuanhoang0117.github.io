# Workstation setup (Windows PC with WSL2)

How to set up a Windows workstation so it can run this project's whole agent workflow (lead,
engineers, QA, reviewers) instead of the MacBook. The agent runs eat CPU: QA and reviewers each run
full Playwright suites, and three at once overloaded the laptop (Sprint 2). The workstation takes
that load.

Everything runs inside **WSL2 (Ubuntu)**, not native Windows. The scripts, guards and paths assume a
Unix shell; under WSL2 they work unchanged.

## How to use this document

It is written for two readers:

- **[Tuan]** steps need an admin prompt, a password, a browser login, or a secret. Only Tuan does
  them.
- **[Agent]** steps a Claude Code session on the workstation can run itself, then check.

If you are an agent following this: do the [Agent] steps in order and run each check. When you reach
a [Tuan] step, stop and ask Tuan to do it, then continue. Never ask for, print, or handle a token.
If a guard or permission refuses something, stop and tell Tuan; don't do it another way
([agent-guide.md](agent-guide.md)).

## 1. Windows: install WSL2 [Tuan]

1. Open PowerShell **as administrator** and run `wsl --install -d Ubuntu`. Restart when asked.
2. Open "Ubuntu" from the Start menu and create your Linux user and password. That password is what
   `sudo` asks for later.
3. Optional, recommended for a workstation: let WSL use most of the machine. Create
   `C:\Users\<you>\.wslconfig` with:

   ```ini
   [wsl2]
   # About three quarters of the PC's RAM, and most of its cores:
   memory=24GB
   processors=12
   ```

   then run `wsl --shutdown` in PowerShell and reopen Ubuntu.

4. Install Claude Code **inside Ubuntu** (the Linux version), following
   <https://docs.claude.com/en/docs/claude-code/setup>. If you use VS Code, install the "WSL"
   extension and open the repo from Ubuntu with `code .`, so the editor and Claude Code both run in
   Linux.

## 2. System packages [Tuan, needs sudo]

In the Ubuntu terminal:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential tmux unzip
# The credential guard in .claude/settings.json and .codex/config.toml points gh at /var/empty.
# macOS has that folder; Ubuntu doesn't, so create it read-only and empty.
sudo mkdir -p /var/empty && sudo chmod 555 /var/empty
```

Install the GitHub CLI from GitHub's official apt repository, following "Debian, Ubuntu Linux" at
<https://github.com/cli/cli/blob/trunk/docs/install_linux.md>.

**Check [Agent]:** `git --version`, `gh --version`, `tmux -V` all print versions, and
`test -d /var/empty && ! test -w /var/empty && echo ok` prints `ok`.

## 3. Node [Agent]

Install nvm from <https://github.com/nvm-sh/nvm#installing-and-updating> (use the install line from
its README), open a new shell, then:

```bash
nvm install 24
nvm alias default 24
```

**Check:** `node -v` prints `v24.x`.

## 4. Clone the repo [Agent]

Clone into the Linux home folder, **not** under `/mnt/c`: the Windows filesystem is far slower for
`node_modules` and Playwright, and it brings Windows line endings.

```bash
cd ~
git clone https://github.com/tuanhoang0117/tuanhoang0117.github.io.git
cd tuanhoang0117.github.io
git config core.autocrlf false
git checkout v2
git remote set-head origin -a   # agent worktrees branch from origin/HEAD (Sprint 1 lesson)
npm ci
(cd worker && npm ci)
```

Then Playwright's browser and its system libraries **[Tuan, needs sudo]**:

```bash
npx playwright install --with-deps chromium
```

**Check [Agent]:** `git symbolic-ref refs/remotes/origin/HEAD` prints `refs/remotes/origin/v2`.

## 5. Identities and secrets [Tuan]

Do all of this in a normal Ubuntu terminal, **not** inside a Claude Code session: the repo's guard
hides GitHub logins from Claude sessions on purpose.

1. **Your git identity:** `git config --global user.name "Tuan Hoang"` and
   `git config --global user.email "<your email>"`.
2. **Your own GitHub login** (for approvals, merges and status overrides): `gh auth login`, choose
   GitHub.com, HTTPS, and log in with the browser.
3. **A bot token for this machine.** Make a new one rather than copying the Mac's, so either machine
   can be revoked alone. Sign in to GitHub **as tuanhoang-bot**, then Settings → Developer settings →
   Personal access tokens → Tokens (classic) → Generate new token (classic): name it
   "workstation", 90-day expiry, scope **`repo` only**. Store it without it touching your shell
   history or the screen:

   ```bash
   mkdir -p ~/.config/tuanhoang-bot && chmod 700 ~/.config/tuanhoang-bot
   ( umask 077; read -rsp 'bot token: ' t; printf '%s' "$t" > ~/.config/tuanhoang-bot/token; echo )
   chmod 600 ~/.config/tuanhoang-bot/token
   ```

   Never paste the token into a Claude chat, a file in the repo, or a message.
   `scripts/as-bot.sh` reads this file on Linux (and Keychain on the Mac).
   `.claude/settings.json` denies Claude's Read tool on this folder.

4. **Claude Code user settings.** Claude Code's worktree guard refuses `scripts/as-bot.sh` for
   agents unless you allow it (Sprint 1 lesson). Add to `~/.claude/settings.json` (create it if
   missing):

   ```json
   {
     "permissions": {
       "allow": ["Bash(scripts/as-bot.sh *)", "Bash(./scripts/as-bot.sh *)"]
     }
   }
   ```

5. **Cloudflare (only when deploying the counter Worker):** `cd worker && npx wrangler login`, in a
   normal terminal. Not needed for the rest of the workflow.

## 6. Copy the local-only files from the Mac [Tuan]

These are deliberately not in git, so cloning doesn't bring them. Copy them through a **private**
route only (a USB drive, or your own private cloud folder). Never through git, a gist, email, or a
chat.

| On the Mac                                                                    | On the workstation                    | What it is                                          |
| ----------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `<repo>/CLAUDE.md`                                                            | `~/tuanhoang0117.github.io/CLAUDE.md` | Local Claude instructions (imports the shared docs) |
| `<repo>/private/` (whole folder)                                              | `~/tuanhoang0117.github.io/private/`  | Handoff note, content facts, denylist, mascot brief |
| `<repo>/DESIGN.md`, `<repo>/photo-tool.html`                                  | same names in the repo folder         | Optional local design notes and tool                |
| `~/.claude/projects/-Users-tuanhoang-Desktop-tuanhoang0117-github-io/memory/` | `~/.claude/projects/<key>/memory/`    | The lead's saved notes about how you work           |

`<key>` is the workstation's repo path with every `/` and `.` replaced by `-`. For
`/home/tuan/tuanhoang0117.github.io` it is `-home-tuan-tuanhoang0117-github-io`. Start Claude Code
in the repo once first so the folder exists, then copy the memory files into it.

After copying: `chmod -R go-rwx ~/tuanhoang0117.github.io/private`.

**Copy `private/` last, after the Mac's final lead session has updated `private/handoff.md`** (see
section 8), so the workstation starts from the newest note.

## 7. Verify [Agent]

Start a **new** Claude Code session in the repo (agent definitions load at session start), then run
each check and report the results to Tuan:

| Check                                                                 | Expected                                   |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `gh api user -q .login`                                               | **Fails** (the guard hides Tuan's login)   |
| `scripts/as-bot.sh gh api user -q .login`                             | `tuanhoang-bot`                            |
| `stat -c %a ~/.config/tuanhoang-bot/token`                            | `600` (do not read the file itself)        |
| `scripts/as-bot.sh git ls-remote origin v2`                           | one line ending in `refs/heads/v2`         |
| `test -f CLAUDE.md && test -f private/handoff.md && echo ok`          | `ok`                                       |
| `npm run check`                                                       | passes                                     |
| `npm run test:e2e`                                                    | passes (note the count and the duration)   |
| `(cd worker && npm run check)`                                        | passes                                     |
| `scripts/dispatch.sh qa <an open PR number> --no-launch`, then remove | creates `.worktrees/qa-<n>` at the PR head |
| the worktree it made with `git worktree remove .worktrees/qa-<n>`     |                                            |

If any check fails, stop and tell Tuan which one and the exact output (never a token).

## 8. Moving the lead from the Mac [Tuan + both leads]

Only one lead runs at a time ([lead-guide.md](lead-guide.md)). To switch:

1. On the Mac, the lead finishes or stops every running agent and updates `private/handoff.md`
   (lead guide → "Ending a session"). Then close that session and don't start agents on the Mac
   again.
2. Copy `private/` (and anything else in section 6 that changed) to the workstation.
3. On the workstation, start Claude Code in the repo and follow lead-guide.md → "Starting a
   session": read the handoff, check it against GitHub, report to Tuan.

Unpushed work on the Mac does not travel: push it first, or note it in the handoff.

## Working on the workstation

- **Ports and folders** are the same as on the Mac (agent guide → Commands). Each agent still gets
  its own scratch folder.
- **Limit test runs.** Give agents' Playwright runs a time limit, and check `uptime` before starting
  more. A stuck run once held a browser for about 8 hours (Sprint 2). The agent cap stays at three
  until Tuan raises it.
- Tuan's owner commands (overrides, merges) run in a normal Ubuntu terminal with his own `gh` login,
  never as `!` commands inside Claude Code.

## Troubleshooting

- `as-bot: no ~/.config/tuanhoang-bot/token`: section 5, step 3.
- `as-bot: ... must be mode 600`: `chmod 600 ~/.config/tuanhoang-bot/token`.
- Plain `gh` works inside a Claude session: `/var/empty` is missing or writable (section 2), or the
  session didn't start in the repo, so `.claude/settings.json` didn't load.
- The guard refuses `scripts/as-bot.sh git ...` for agents: section 5, step 4, then start a new
  session.
- Playwright says a browser dependency is missing: rerun `npx playwright install --with-deps chromium`.
