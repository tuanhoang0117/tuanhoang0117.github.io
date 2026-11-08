/**
 * Carries the agent/qa and agent/review verdicts from an older commit of a PR to its new head,
 * when the only change since is a merge of the base branch. Tuan decides each carry, per PR; this
 * script only checks that it is safe and records it (docs/agent-workflow.md, "Carrying verdicts
 * forward").
 *
 *   node scripts/carry-forward.ts <pr>                       # dry run: checks + plan, writes nothing
 *   node scripts/carry-forward.ts <pr> --print-owner-commands --owner-ok "<Tuan's decision>"
 *   node scripts/carry-forward.ts <pr> --post --owner-ok "<Tuan's decision>"
 *
 * Options: --old <sha> (the verified commit to carry from; default: the newest one on the PR),
 * --head <sha> (refuse unless the PR head is this commit), --allow-pending-ci (let CI runs that
 * are still in progress through; failed runs always refuse).
 *
 * Every GitHub read and write goes through scripts/as-bot.sh gh, which supplies the token. This
 * script never reads the token itself, and redacts anything token-shaped from what it prints.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const REPO = "tuanhoang0117/tuanhoang0117.github.io";
const API = `repos/${REPO}`;
const CONTEXTS = ["agent/qa", "agent/review"] as const;
export type Context = (typeof CONTEXTS)[number];
const LABEL: Record<Context, string> = { "agent/qa": "QA report", "agent/review": "review" };
// GitHub's compare API lists at most 300 files; past that we can't prove every file was checked.
const COMPARE_FILE_LIMIT = 300;
const BODY_DELIMITER = "CARRY_FORWARD_BODY";
// Only verdicts the agents posted themselves can be carried: the bot account, with the exact
// verdict the agent definitions publish (.claude/agents/qa.md, reviewer.md), alone or followed by
// one of the notes agents have actually appended: a combined agent's "(combined ...)", the tool
// "(OpenAI Codex, <model>)" or " — OpenAI Codex, <model>", or a re-check's "(<sha> only)". Anything
// else, such as "QA: PASS but e2e failing", Tuan's "Override by Tuan: ..." or "No agent run: ...",
// or a status that was itself carried, is refused: an allow-list fails closed on wording nobody
// listed. A new agent wording refuses until it is added here.
export const BOT = "tuanhoang-bot";
const NOTE = String.raw`(?: \((?:combined [^()]+|OpenAI Codex, [^()]+|[0-9a-f]{7,40} only)\)| — OpenAI Codex, [^()]+)?`;
const VERDICT: Record<Context, RegExp> = {
  "agent/qa": new RegExp(String.raw`^QA: PASS${NOTE}$`),
  "agent/review": new RegExp(String.raw`^Review: APPROVE(?: WITH SUGGESTIONS)?${NOTE}$`),
};

/** Runs `gh <args>` (as the bot) and returns stdout. Throws on a non-zero exit. */
export type GhRunner = (args: string[]) => string;

export interface Io {
  gh: GhRunner;
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
}

interface Status {
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
  creator?: { login: string } | null;
}

interface CompareFile {
  filename: string;
  status: string;
  sha: string | null;
  previous_filename?: string;
}

interface Compare {
  merge_base_commit: { sha: string };
  files?: CompareFile[];
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

interface Check {
  name: string;
  ok: boolean;
  lines: string[];
}

class UsageError extends Error {}

const short = (sha: string) => sha.slice(0, 7);

/** Masks the bot token (and anything shaped like a GitHub token) in text before it's printed. */
export function redact(text: string, env: Record<string, string | undefined>): string {
  let out = text;
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  if (token && token.length >= 8) out = out.split(token).join("[redacted]");
  return out.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    "[redacted]",
  );
}

function parse(argv: string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        post: { type: "boolean", default: false },
        "print-owner-commands": { type: "boolean", default: false },
        "owner-ok": { type: "string" },
        old: { type: "string" },
        head: { type: "string" },
        "allow-pending-ci": { type: "boolean", default: false },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values, positionals } = parsed;
  const [pr, ...extra] = positionals;
  if (!pr || !/^\d+$/.test(pr) || extra.length > 0) {
    throw new UsageError("give exactly one PR number");
  }
  for (const flag of ["old", "head"] as const) {
    const v = values[flag];
    if (v !== undefined && !/^[0-9a-f]{7,40}$/.test(v)) {
      throw new UsageError(`--${flag} must be a commit sha (7 to 40 lowercase hex characters)`);
    }
  }
  if (values.post && values["print-owner-commands"]) {
    throw new UsageError("use --post or --print-owner-commands, not both");
  }
  const ownerOk = values["owner-ok"]?.trim();
  const writing = values.post || values["print-owner-commands"];
  if (writing && !ownerOk) {
    const mode = values.post ? "--post" : "--print-owner-commands";
    throw new UsageError(
      `${mode} needs --owner-ok "<text>" recording Tuan's decision for this PR; refusing`,
    );
  }
  return {
    pr,
    mode: values.post ? "post" : values["print-owner-commands"] ? "print" : "dry",
    ownerOk,
    old: values.old,
    head: values.head,
    allowPendingCi: values["allow-pending-ci"],
  } as const;
}

type Options = ReturnType<typeof parse>;

function api<T>(gh: GhRunner, path: string): T {
  return JSON.parse(gh(["api", path])) as T;
}

/** Every page of a list endpoint, as an array of pages. */
function apiPages<T>(gh: GhRunner, path: string): T[] {
  return JSON.parse(gh(["api", "--paginate", "--slurp", path])) as T[];
}

/**
 * The newest agent/* status per context on a commit. Reads the full status list (every page),
 * which GitHub returns newest first and which, unlike the combined status, says who posted each.
 */
function agentStatuses(gh: GhRunner, sha: string): Map<string, Status> {
  const all = apiPages<Status[]>(gh, `${API}/commits/${sha}/statuses?per_page=100`).flat();
  const byContext = new Map<string, Status>();
  for (const s of all) {
    if (s.context.startsWith("agent/") && !byContext.has(s.context)) byContext.set(s.context, s);
  }
  return byContext;
}

/** A PASS/APPROVE the agent itself posted on this commit: not carried, overridden or Tuan's. */
export function isOwnVerdict(ctx: Context, s: Status | undefined): boolean {
  if (!s || s.state !== "success" || s.creator?.login !== BOT) return false;
  const description = s.description ?? "";
  return VERDICT[ctx].test(description) && !/carried|override/i.test(description);
}

function describeStatus(s: Status | undefined): string {
  if (!s) return "none";
  return `${s.state} "${s.description ?? ""}"`;
}

function prFiles(gh: GhRunner, base: string, sha: string): Compare {
  return api<Compare>(gh, `${API}/compare/${base}...${sha}`);
}

const fileKey = (f: CompareFile) => JSON.stringify([f.status, f.sha, f.previous_filename ?? null]);

interface Plan {
  pr: string;
  url: string;
  head: string;
  old: string;
  oldStatuses: Map<string, Status>;
  files: string[];
  pendingCi: string[];
  ciTotal: number;
}

/** Runs every check. Returns the checks for printing and, if all passed, the plan. */
function runChecks(gh: GhRunner, opts: Options): { checks: Check[]; plan?: Plan } {
  const checks: Check[] = [];
  const pr = api<{
    state: string;
    html_url: string;
    head: { sha: string };
    base: { ref: string };
  }>(gh, `${API}/pulls/${opts.pr}`);
  const head = pr.head.sha;

  // 1. Open, and the head is the commit we were given.
  const open: Check = { name: "PR is open at the expected head", ok: true, lines: [] };
  open.lines.push(`PR #${opts.pr} is ${pr.state}, head ${head}, base ${pr.base.ref}`);
  if (pr.state !== "open") {
    open.ok = false;
    open.lines.push("PR is not open");
  }
  if (opts.head && !head.startsWith(opts.head)) {
    open.ok = false;
    open.lines.push(`head is ${short(head)}, not the --head ${opts.head} you gave`);
  }
  checks.push(open);

  // 2. An older commit with both agents' own success verdicts, and nothing worse since.
  const commits = apiPages<{ sha: string }[]>(gh, `${API}/pulls/${opts.pr}/commits`)
    .flat()
    .map((c) => c.sha);
  const verified: Check = { name: "an older commit has both agents' PASS", ok: false, lines: [] };
  checks.push(verified);
  const headIndex = commits.lastIndexOf(head);
  if (headIndex === -1) {
    verified.lines.push(`head ${short(head)} is not in the PR's commit list`);
    return { checks };
  }
  let old: string | undefined;
  let oldStatuses = new Map<string, Status>();
  const newer: { sha: string; statuses: Map<string, Status> }[] = [];
  const headStatuses = agentStatuses(gh, head);
  newer.push({ sha: head, statuses: headStatuses });
  if (opts.old) {
    const index = commits.findIndex((sha) => sha.startsWith(opts.old as string));
    if (index === -1 || index >= headIndex) {
      verified.lines.push(`--old ${opts.old} is not a commit on this PR before the head`);
      return { checks };
    }
    old = commits[index] as string;
    oldStatuses = agentStatuses(gh, old);
    for (const sha of commits.slice(index + 1, headIndex)) {
      newer.push({ sha, statuses: agentStatuses(gh, sha) });
    }
    for (const ctx of CONTEXTS) {
      const s = oldStatuses.get(ctx);
      if (!isOwnVerdict(ctx, s)) {
        verified.lines.push(
          s?.state === "success"
            ? `${ctx} on ${short(old)} is ${describeStatus(s)} by ${s.creator?.login ?? "unknown"}, ` +
                `not an agent's own verdict (only ${BOT}'s agent PASS/APPROVE counts; no chains)`
            : `${ctx} on ${short(old)} is ${describeStatus(s)}, not success`,
        );
      }
    }
    if (verified.lines.length > 0) return { checks };
  } else {
    for (let i = headIndex - 1; i >= 0; i--) {
      const sha = commits[i] as string;
      const statuses = agentStatuses(gh, sha);
      if (CONTEXTS.every((ctx) => isOwnVerdict(ctx, statuses.get(ctx)))) {
        old = sha;
        oldStatuses = statuses;
        break;
      }
      newer.push({ sha, statuses });
    }
    if (!old) {
      verified.lines.push(
        `no earlier commit on the PR has agent/qa and agent/review both an agent's own PASS/APPROVE ` +
          `posted by ${BOT} (carried, overridden and owner statuses don't count)`,
      );
      return { checks };
    }
  }
  // A later FAIL or BLOCK (or one still pending) must never be papered over by an older PASS.
  const worse = newer.flatMap(({ sha, statuses }) =>
    [...statuses.values()]
      .filter((s) => s.state !== "success")
      .map((s) => `${s.context} on ${short(sha)} is ${describeStatus(s)}`),
  );
  if (CONTEXTS.every((ctx) => headStatuses.get(ctx)?.state === "success")) {
    worse.push(`the head ${short(head)} already has both statuses as success; nothing to carry`);
  }
  verified.ok = worse.length === 0;
  verified.lines.push(`carry from ${old}:`);
  for (const ctx of CONTEXTS) {
    const s = oldStatuses.get(ctx);
    verified.lines.push(`  ${ctx}: ${describeStatus(s)} ${s?.target_url ?? "(no link)"}`);
  }
  verified.lines.push(...worse.map((w) => `refused: ${w}`));

  // 3. The PR's own changes are identical at both heads, and the base didn't touch them.
  const filesCheck: Check = { name: "the PR's own files are unchanged", ok: true, lines: [] };
  checks.push(filesCheck);
  const atNew = prFiles(gh, pr.base.ref, head);
  const atOld = prFiles(gh, pr.base.ref, old);
  const newFiles = new Map((atNew.files ?? []).map((f) => [f.filename, f]));
  const oldFiles = new Map((atOld.files ?? []).map((f) => [f.filename, f]));
  if (newFiles.size >= COMPARE_FILE_LIMIT || oldFiles.size >= COMPARE_FILE_LIMIT) {
    filesCheck.ok = false;
    filesCheck.lines.push(`the PR changes ${COMPARE_FILE_LIMIT}+ files; too many to verify`);
  }
  // A renamed file is also known by its old name: the base touching that name matters too.
  const prNames = new Set<string>();
  for (const f of [...newFiles.values(), ...oldFiles.values()]) {
    prNames.add(f.filename);
    if (f.previous_filename) prNames.add(f.previous_filename);
  }
  const differing: string[] = [];
  for (const name of [...new Set([...newFiles.keys(), ...oldFiles.keys()])].sort()) {
    const n = newFiles.get(name);
    const o = oldFiles.get(name);
    if (!n) differing.push(`${name}: changed by the PR at ${short(old)} but not at ${short(head)}`);
    else if (!o)
      differing.push(`${name}: changed by the PR at ${short(head)} but not at ${short(old)}`);
    else if (fileKey(n) !== fileKey(o)) differing.push(`${name}: differs between the two heads`);
  }
  const oldBase = atOld.merge_base_commit.sha;
  const newBase = atNew.merge_base_commit.sha;
  if (oldBase !== newBase) {
    const baseChanged = api<Compare>(gh, `${API}/compare/${oldBase}...${newBase}`);
    const baseFiles = baseChanged.files ?? [];
    if (baseFiles.length >= COMPARE_FILE_LIMIT) {
      filesCheck.ok = false;
      filesCheck.lines.push(`the base changed ${COMPARE_FILE_LIMIT}+ files; too many to verify`);
    }
    for (const f of baseFiles) {
      for (const name of [f.filename, f.previous_filename]) {
        if (name && prNames.has(name)) {
          differing.push(`${name}: also changed on ${pr.base.ref} since ${short(old)}`);
        }
      }
    }
  }
  if (differing.length > 0) {
    filesCheck.ok = false;
    filesCheck.lines.push("files that differ:", ...differing.map((d) => `  ${d}`));
  }
  const files = [...newFiles.keys()].sort();
  if (newFiles.size === 0) {
    filesCheck.ok = false;
    filesCheck.lines.push(`the PR changes no files against ${pr.base.ref}`);
  }
  filesCheck.lines.unshift(
    `base ${pr.base.ref}: merge base ${short(oldBase)} at the old head, ${short(newBase)} at the new head`,
    `${files.length} PR file(s) at the new head: ${files.join(", ") || "none"}`,
  );

  // 4. CI on the new head.
  const runs = apiPages<{ check_runs: CheckRun[] }>(
    gh,
    `${API}/commits/${head}/check-runs?per_page=100`,
  ).flatMap((page) => page.check_runs);
  const ci: Check = { name: "CI on the new head passed", ok: true, lines: [] };
  checks.push(ci);
  const pending = runs.filter((r) => r.status !== "completed").map((r) => r.name);
  const failed = runs
    .filter((r) => r.status === "completed" && r.conclusion !== "success")
    .map((r) => `${r.name} (${r.conclusion})`);
  for (const r of runs) ci.lines.push(`${r.name}: ${r.status} ${r.conclusion ?? ""}`.trimEnd());
  if (runs.length === 0) {
    ci.ok = false;
    ci.lines.push("no CI check runs on the new head yet");
  }
  if (failed.length > 0) {
    ci.ok = false;
    ci.lines.push(`failed: ${failed.join(", ")}`);
  }
  if (pending.length > 0) {
    if (opts.allowPendingCi) {
      ci.lines.push(`still running (allowed by --allow-pending-ci): ${pending.join(", ")}`);
    } else {
      ci.ok = false;
      ci.lines.push(`still running: ${pending.join(", ")} (wait, or pass --allow-pending-ci)`);
    }
  }

  if (!checks.every((c) => c.ok)) return { checks };
  return {
    checks,
    plan: {
      pr: opts.pr,
      url: pr.html_url,
      head,
      old,
      oldStatuses,
      files,
      pendingCi: pending,
      ciTotal: runs.length,
    },
  };
}

/** Agent statuses on the head that aren't success: a FAIL, BLOCK or pending posted since. */
function headObjections(gh: GhRunner, head: string): string[] {
  return [...agentStatuses(gh, head).values()]
    .filter((s) => s.state !== "success")
    .map((s) => `${s.context} on ${short(head)} is now ${describeStatus(s)}`);
}

export function descriptions(old: string): Record<Context, string> {
  return {
    "agent/qa": `QA: PASS (carried forward from ${short(old)})`,
    "agent/review": `Review: APPROVE (carried forward from ${short(old)})`,
  };
}

export function commentBody(plan: Plan, ownerOk: string, postedBy: string): string {
  const links = CONTEXTS.map((ctx) => {
    const s = plan.oldStatuses.get(ctx);
    const link = s?.target_url ? `[${LABEL[ctx]}](${s.target_url})` : "(no link on the status)";
    return `- \`${ctx}\` on \`${short(plan.old)}\`: ${describeStatus(s)}, ${link}`;
  });
  const ci =
    plan.pendingCi.length > 0
      ? `CI was still running when this was posted: ${plan.pendingCi.map((n) => `\`${n}\``).join(", ")} (\`--allow-pending-ci\`). The required checks still gate the merge.`
      : `all ${plan.ciTotal} check runs completed and succeeded.`;
  return [
    `### Agent verdicts carried forward from \`${short(plan.old)}\` to \`${short(plan.head)}\``,
    "",
    `**No agent ran on the new head (\`${short(plan.head)}\`).** Its \`agent/qa\` and \`agent/review\` statuses are copied from the old head, because only merges of the base branch changed the branch since, leaving every file the PR changes identical.`,
    "",
    `- Old head: ${plan.old}`,
    `- New head: ${plan.head}`,
    ...links,
    `- CI on the new head: ${ci}`,
    `- Posted by: ${postedBy}, with \`scripts/carry-forward.ts\`.`,
    "",
    "Owner decision (verbatim):",
    "",
    ...ownerOk.split("\n").map((line) => `> ${line}`),
    "",
    `Files the PR changes, each identical at both heads and untouched by the base branch since the old head (${plan.files.length}):`,
    "",
    ...plan.files.map((f) => `- \`${f}\``),
    "",
  ].join("\n");
}

const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** The commands Tuan runs in his own terminal, with his own gh login, to post the carry. */
export function ownerCommands(plan: Plan, ownerOk: string): string {
  const body = commentBody(plan, ownerOk, "Tuan, from his own account");
  if (body.split("\n").includes(BODY_DELIMITER)) {
    throw new Error(`the comment body contains the line ${BODY_DELIMITER}; reword --owner-ok`);
  }
  const desc = descriptions(plan.old);
  return [
    "(",
    "set -euo pipefail",
    // Tuan may run these hours later: re-check the PR and the head's agent statuses first.
    `pr=$(gh api ${API}/pulls/${plan.pr} --jq '.state + " " + .head.sha')`,
    `[ "$pr" = "open ${plan.head}" ] || { echo "PR #${plan.pr} closed or head moved (now: $pr); not posting" >&2; exit 1; }`,
    `bad=$(gh api '${API}/commits/${plan.head}/status?per_page=100' --jq '[.statuses[] | select(.context | startswith("agent/")) | select(.state != "success") | .context + " " + .state] | join(", ")')`,
    `[ -z "$bad" ] || { echo "the head now has $bad; not posting" >&2; exit 1; }`,
    "body_file=$(mktemp)",
    `cat > "$body_file" <<'${BODY_DELIMITER}'`,
    body.replace(/\n$/, ""),
    BODY_DELIMITER,
    `url=$(gh api -X POST ${API}/issues/${plan.pr}/comments -F body=@"$body_file" --jq .html_url)`,
    `[ -n "$url" ] || { echo "posting the comment returned no URL; not posting the statuses" >&2; exit 1; }`,
    'echo "comment: $url"',
    ...CONTEXTS.map(
      (ctx) =>
        `gh api -X POST ${API}/statuses/${plan.head} -f state=success -f context=${ctx} -f description=${shq(desc[ctx])} -f target_url="$url" --silent`,
    ),
    // Like --post, read the statuses back: the newest per context must be the one just posted.
    ...CONTEXTS.flatMap((ctx) => [
      `got=$(gh api '${API}/commits/${plan.head}/status?per_page=100' --jq '.statuses[] | select(.context == "${ctx}") | .state + " " + .target_url + " " + .description')`,
      `[ "$got" = "success $url "${shq(desc[ctx])} ] || { echo "${ctx} did not stick on ${plan.head} (now: $got); check GitHub" >&2; exit 1; }`,
    ]),
    `echo "verified: both statuses are on ${plan.head}"`,
    ")",
  ].join("\n");
}

function post(io: Io, plan: Plan, ownerOk: string): number {
  // The head can move while the checks run. Re-read it right before writing anything.
  const now = api<{ state: string; head: { sha: string } }>(io.gh, `${API}/pulls/${plan.pr}`);
  if (now.state !== "open" || now.head.sha !== plan.head) {
    io.err(
      `refused: PR #${plan.pr} changed during the checks (now ${now.state} at ${short(now.head.sha)}, ` +
        `checked ${short(plan.head)}); nothing posted. Run it again.`,
    );
    return 1;
  }
  const objections = headObjections(io.gh, plan.head);
  if (objections.length > 0) {
    io.err(`refused: ${objections.join("; ")}; nothing posted.`);
    return 1;
  }
  const body = commentBody(plan, ownerOk, "tuanhoang-bot (`--post`)");
  const comment = JSON.parse(
    io.gh(["api", "-X", "POST", `${API}/issues/${plan.pr}/comments`, "-f", `body=${body}`]),
  ) as { html_url: string };
  io.out(`posted comment ${comment.html_url}`);
  const desc = descriptions(plan.old);
  for (const ctx of CONTEXTS) {
    io.gh([
      "api",
      "-X",
      "POST",
      `${API}/statuses/${plan.head}`,
      "-f",
      "state=success",
      "-f",
      `context=${ctx}`,
      "-f",
      `description=${desc[ctx]}`,
      "-f",
      `target_url=${comment.html_url}`,
    ]);
    io.out(`posted ${ctx} on ${short(plan.head)}: ${desc[ctx]}`);
  }
  const after = agentStatuses(io.gh, plan.head);
  const missing = CONTEXTS.filter((ctx) => {
    const s = after.get(ctx);
    return !(
      s &&
      s.state === "success" &&
      s.description === desc[ctx] &&
      s.target_url === comment.html_url
    );
  });
  if (missing.length > 0) {
    io.err(`the statuses did not stick on ${plan.head}: ${missing.join(", ")}. Check GitHub.`);
    return 1;
  }
  io.out(`verified: both statuses are on ${plan.head}`);
  return 0;
}

/** Entry point. Returns the exit code: 0 ok, 1 refused or failed, 2 usage error. */
export function main(argv: string[], io: Io): number {
  const out = (line: string) => io.out(redact(line, io.env));
  const err = (line: string) => io.err(redact(line, io.env));
  const safe: Io = { ...io, out, err };
  let opts: Options;
  try {
    opts = parse(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`carry-forward: ${e.message}`);
    err(
      'usage: node scripts/carry-forward.ts <pr> [--post | --print-owner-commands] [--owner-ok "<text>"]',
    );
    err("                                     [--old <sha>] [--head <sha>] [--allow-pending-ci]");
    return 2;
  }
  try {
    const { checks, plan } = runChecks(io.gh, opts);
    out(
      `Carry-forward for PR #${opts.pr} (${opts.mode === "dry" ? "dry run, writes nothing" : opts.mode === "print" ? "printing owner commands, writes nothing" : "posting"})`,
    );
    for (const [i, c] of checks.entries()) {
      out(`${i + 1}. ${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
      for (const line of c.lines) out(`     ${line}`);
    }
    if (!plan) {
      err("refused: not every check passed; nothing posted.");
      return 1;
    }
    const desc = descriptions(plan.old);
    out("Plan:");
    out(`  1. comment on ${plan.url} (old head, new head, files, CI, owner decision, links)`);
    out(`  2. agent/qa on ${short(plan.head)}: success "${desc["agent/qa"]}"`);
    out(`  3. agent/review on ${short(plan.head)}: success "${desc["agent/review"]}"`);
    if (opts.mode === "dry") {
      out("Dry run: nothing written. Post only after Tuan decides, with --owner-ok.");
      return 0;
    }
    const ownerOk = opts.ownerOk as string;
    if (opts.mode === "print") {
      out("Tuan: run this in a normal terminal (not inside Claude Code), logged in to gh as you:");
      out("");
      out(ownerCommands(plan, ownerOk));
      return 0;
    }
    return post(safe, plan, ownerOk);
  } catch (e) {
    err(`carry-forward failed: ${(e as Error).message}`);
    return 1;
  }
}

const asBot = fileURLToPath(new URL("./as-bot.sh", import.meta.url));

export const botGh: GhRunner = (args) => {
  try {
    return execFileSync(asBot, ["gh", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const { stderr, status } = e as { stderr?: string; status?: number };
    throw new Error(`gh ${args.slice(0, 2).join(" ")} exited ${status}: ${stderr?.trim() ?? ""}`);
  }
};

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), {
    gh: botGh,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    env: process.env,
  });
}
