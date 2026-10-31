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
3. Install Claude Code **inside Ubuntu** (the Linux version), following
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
section 9), so the workstation starts from the newest note.

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

## 8. Size the workload to this machine [Agent; one step Tuan]

The agents think in the cloud; this machine only runs builds and test suites. What overloaded the
Mac was several suites at once: `playwright.config.ts` sets no worker count, so every run starts one
Chrome worker per two logical cores, and three QA/reviewer runs on a 10-core, 16 GB MacBook meant
about 15 browsers on 10 cores. A GPU doesn't help (headless Chrome renders on the CPU); cores and RAM
do. Work out the limits from this machine's real numbers, not from guesses.

Keep every number below in a scratch file from `mktemp`, and report them to Tuan at the end.

**8.1 Read the host's specs.** From WSL, through Windows interop:

```bash
powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Processor | Measure-Object NumberOfCores,NumberOfLogicalProcessors -Sum | ForEach-Object Sum) -join ' '" | tr -d '\r'
powershell.exe -NoProfile -Command "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)" | tr -d '\r'
powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Processor).Name" | tr -d '\r'
df -h ~ | tail -1
```

That gives physical cores, logical processors (`HOST_LOGICAL`), RAM in GB (`HOST_GB`), the CPU
name, and free disk. Flag to Tuan if free disk is under 30 GB (each agent worktree holds its own
`node_modules`).

**8.2 Propose `.wslconfig` [Tuan applies].** By default WSL gets half the RAM. Leave Windows 2
logical processors and 8 GB (or a quarter of RAM, whichever is larger):

```ini
[wsl2]
processors=<HOST_LOGICAL - 2>
memory=<HOST_GB - max(8, HOST_GB / 4)>GB
```

Show Tuan the file with the numbers filled in. He saves it as `C:\Users\<him>\.wslconfig`, runs
`wsl --shutdown` in PowerShell, and reopens Ubuntu. Then check inside WSL: `nproc` (call it `C`)
and `free -g` total (call it `M`) should match the file.

**8.3 Measure one suite alone.** With nothing else running (`uptime` load under 1):

```bash
s=$(mktemp); (while sleep 2; do free -m | awk '/^Mem:/{print $3}'; done) > "$s" & p=$!
/usr/bin/time -f '%e s' npm run test:e2e -- --workers=4 2>&1 | tail -3
kill $p; sort -n "$s" | tail -1   # peak MB used during the run
```

Record the duration and the peak memory minus the memory used before the run: that is one suite's
footprint at 4 workers (`RUN_MB`). Per-worker cost is roughly `RUN_MB / 5` (4 workers plus the build
and preview server); call it `WORKER_MB`.

**8.4 Work out the limits.** Keep 2 cores and 4 GB for Windows' share of WSL, the editor, Claude Code
and dev servers. Then:

- **Workers per test run (`W`):** `max(2, min(6, floor((C - 2) / 3)))`. Three runs at once is the
  target, because the agent cap is three.
- **Test runs at once (`R`):** `min(3, floor((C - 2) / W), floor((M*1024 - 4096) / (WORKER_MB * (W + 1))))`.
- **Time limit per full run:** 3 × the 8.3 duration, rounded up to whole minutes, at least 10.

If `R` is below 3, the lead can still run three agents, but no more than `R` of them may be running
test suites at the same moment; the others wait or do non-test work.

**8.5 Prove it.** Run `R` full suites at the same time, each in its own checkout with its own
`E2E_PORT`, each with `--workers=W`, each wrapped in `timeout <limit>`. All must pass and each
should take no more than 1.5 × the 8.3 duration. If not, lower `W` by one (or `R`) and repeat.
Check `free -m` and `uptime` during the run: load should stay under `C` and no swap should be used.

**8.6 Record it** in `private/handoff.md`, in a `## Machine` section near the top, so every lead
session reads it:

```markdown
## Machine (sized YYYY-MM-DD)

- Workstation: <CPU name>, <cores>C/<logical>T, <HOST_GB> GB; WSL gets C=<C>, M=<M> GB.
- Per test run: `--workers=<W>`, time limit <N> min (`timeout <N>m ...`).
- Test runs at once: <R>. Agent cap: 3 (Tuan's rule).
- Baseline: one full e2e at 4 workers = <duration>, peak <RUN_MB> MB.
```

From then on the lead puts `--workers=<W>` and the time limit into every engineer, QA and reviewer
prompt, and checks `uptime` before starting another suite.

**Redo this section** when the hardware or `.wslconfig` changes, or when a full suite takes twice
the recorded baseline.

## 9. Moving the lead from the Mac [Tuan + both leads]

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
- **Use the machine's limits** from `private/handoff.md` → Machine (section 8): pass `--workers=<W>`
  and wrap every Playwright run in `timeout`, and keep no more than `R` suites running at once. A
  stuck run once held a browser for about 8 hours (Sprint 2). The agent cap stays at three until
  Tuan raises it.
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
