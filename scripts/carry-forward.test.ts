// @vitest-environment node
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOT, type Context, isOwnVerdict, main, redact, REPO } from "./carry-forward.ts";

const API = `repos/${REPO}`;
const FIRST = "1".repeat(40);
const OLD = "a".repeat(40);
const MID = "c".repeat(40);
const HEAD = "b".repeat(40);
const BASE_OLD = "d".repeat(40);
const BASE_NEW = "e".repeat(40);
const TOKEN = "ghp_" + "Z9".repeat(18);
const COMMENT_URL = "https://github.com/x/y/pull/7#issuecomment-1";
const QA_URL = "https://github.com/x/y/pull/7#issuecomment-qa";
const REVIEW_URL = "https://github.com/x/y/pull/7#issuecomment-review";

interface Status {
  context: string;
  state: string;
  description: string;
  target_url: string | null;
  creator: { login: string };
}
interface File {
  filename: string;
  status: string;
  sha: string;
  previous_filename?: string;
}
interface Run {
  name: string;
  status: string;
  conclusion: string | null;
}

const bot = { login: BOT };
const pass = (): Status[] => [
  {
    context: "agent/qa",
    state: "success",
    description: "QA: PASS",
    target_url: QA_URL,
    creator: bot,
  },
  {
    context: "agent/review",
    state: "success",
    description: "Review: APPROVE",
    target_url: REVIEW_URL,
    creator: bot,
  },
  {
    context: "other/ci",
    state: "success",
    description: "unrelated",
    target_url: null,
    creator: bot,
  },
];

/** Splits a list into GitHub-style pages. */
const pages = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length > 0 ? out : [[]];
};

const prFiles = (): File[] => [
  { filename: "scripts/carry-forward.ts", status: "added", sha: "f1" },
  { filename: "docs/agent-workflow.md", status: "modified", sha: "f2" },
];

/** A PR whose head is a v2 merge on top of a commit both agents passed. */
function world() {
  return {
    pr: { state: "open", head: HEAD, base: "v2" },
    // The head and state as seen by every read after the first one (a push or close mid-run).
    headLater: HEAD,
    stateLater: "open",
    // Agent statuses that appear on the head after the checks (an agent posting mid-run).
    headStatusesLater: undefined as Status[] | undefined,
    commits: [FIRST, OLD, HEAD],
    statuses: { [FIRST]: [], [OLD]: pass(), [HEAD]: [] } as Record<string, Status[]>,
    filesAtOld: prFiles(),
    filesAtNew: prFiles(),
    baseChanged: [{ filename: "src/pages/Home.tsx", status: "modified", sha: "f9" }] as File[],
    runs: [
      { name: "Lint, format, typecheck, unit tests", status: "completed", conclusion: "success" },
      { name: "E2E (Playwright + axe)", status: "completed", conclusion: "success" },
    ] as Run[],
    // Items per page for list endpoints; only reads with --paginate get past the first page.
    pageSize: 100,
    // Set to false to drop status writes, as if GitHub lost them.
    statusesStick: true,
    // Set to store status writes with this link instead of the one sent.
    storedTargetUrl: undefined as string | undefined,
    throwOn: undefined as string | undefined,
  };
}
type World = ReturnType<typeof world>;

function fakeGh(w: World) {
  const calls: string[][] = [];
  let prReads = 0;
  const gh = (args: string[]): string => {
    calls.push(args);
    if (w.throwOn && args.some((a) => a.includes(w.throwOn as string))) {
      throw new Error(`gh: HTTP 401 Bad credentials (token ${TOKEN})`);
    }
    const isWrite = args.includes("-X");
    const path = args.find((a) => a.startsWith("repos/")) as string;
    const field = (name: string) =>
      args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) as string;
    if (isWrite && path === `${API}/issues/7/comments`) {
      return JSON.stringify({ html_url: COMMENT_URL });
    }
    if (isWrite && path.startsWith(`${API}/statuses/`)) {
      const sha = path.split("/").pop() as string;
      if (w.statusesStick) {
        const list = (w.statuses[sha] ??= []);
        list.unshift({
          context: field("context"),
          state: field("state"),
          description: field("description"),
          target_url: w.storedTargetUrl ?? field("target_url"),
          creator: bot,
        });
      }
      return "{}";
    }
    if (isWrite) throw new Error(`unexpected write ${args.join(" ")}`);
    const list = <T>(items: T[], wrap: (page: T[]) => unknown = (p) => p) => {
      const all = pages(items, w.pageSize).map(wrap);
      return JSON.stringify(args.includes("--paginate") ? all : all[0]);
    };
    if (path === `${API}/pulls/7`) {
      const first = prReads++ === 0;
      if (!first && w.headStatusesLater) w.statuses[HEAD] = w.headStatusesLater;
      return JSON.stringify({
        state: first ? w.pr.state : w.stateLater,
        html_url: "https://github.com/x/y/pull/7",
        head: { sha: first ? w.pr.head : w.headLater },
        base: { ref: w.pr.base },
      });
    }
    if (path === `${API}/pulls/7/commits`) {
      return list(w.commits.map((sha) => ({ sha })));
    }
    // The full status list, newest first, with who posted each.
    const statuses = /\/commits\/([0-9a-f]+)\/statuses\?per_page=100$/.exec(path);
    if (statuses) return list(w.statuses[statuses[1] as string] ?? []);
    if (path.startsWith(`${API}/commits/${HEAD}/check-runs`)) {
      return list(w.runs, (page) => ({ total_count: w.runs.length, check_runs: page }));
    }
    if (path === `${API}/compare/v2...${HEAD}`) {
      return JSON.stringify({ merge_base_commit: { sha: BASE_NEW }, files: w.filesAtNew });
    }
    if (path === `${API}/compare/v2...${OLD}` || path === `${API}/compare/v2...${MID}`) {
      return JSON.stringify({ merge_base_commit: { sha: BASE_OLD }, files: w.filesAtOld });
    }
    if (path === `${API}/compare/${BASE_OLD}...${BASE_NEW}`) {
      return JSON.stringify({ merge_base_commit: { sha: BASE_OLD }, files: w.baseChanged });
    }
    throw new Error(`fake gh: no route for ${args.join(" ")}`);
  };
  const writes = () => calls.filter((a) => a.includes("-X"));
  return { gh, calls, writes };
}

function run(argv: string[], w: World = world()) {
  const fake = fakeGh(w);
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, {
    gh: fake.gh,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    env: { GH_TOKEN: TOKEN },
  });
  return {
    code,
    out: out.join("\n"),
    err: err.join("\n"),
    all: [...out, ...err].join("\n"),
    fake,
    w,
  };
}

const OK = 'Tuan said "carry it over" on 2026-10-26';
const POST = ["7", "--post", "--owner-ok", OK];

describe("carry-forward", () => {
  it("dry run (the default) passes every check, prints the plan, and writes nothing", () => {
    const r = run(["7"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("dry run, writes nothing");
    for (const n of [1, 2, 3, 4]) expect(r.out).toContain(`${n}. PASS`);
    expect(r.out).toContain(`QA: PASS (carried forward from aaaaaaa)`);
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses --post without --owner-ok, before touching GitHub", () => {
    for (const argv of [
      ["7", "--post"],
      ["7", "--post", "--owner-ok", "  "],
    ]) {
      const r = run(argv);
      expect(r.code).not.toBe(0);
      expect(r.err).toMatch(/--owner-ok/);
      expect(r.fake.calls).toEqual([]);
    }
  });

  it("--owner-ok without --post is still a dry run", () => {
    const r = run(["7", "--owner-ok", OK]);
    expect(r.code).toBe(0);
    expect(r.fake.writes()).toEqual([]);
  });

  it("posts exactly one comment, then the two statuses with the exact descriptions", () => {
    const r = run(POST);
    expect(r.code).toBe(0);
    const writes = r.fake.writes();
    expect(writes).toHaveLength(3);
    const [comment, qa, review] = writes as [string[], string[], string[]];
    expect(comment).toContain(`${API}/issues/7/comments`);
    expect(qa).toEqual([
      "api",
      "-X",
      "POST",
      `${API}/statuses/${HEAD}`,
      "-f",
      "state=success",
      "-f",
      "context=agent/qa",
      "-f",
      "description=QA: PASS (carried forward from aaaaaaa)",
      "-f",
      `target_url=${COMMENT_URL}`,
    ]);
    expect(review).toEqual([
      "api",
      "-X",
      "POST",
      `${API}/statuses/${HEAD}`,
      "-f",
      "state=success",
      "-f",
      "context=agent/review",
      "-f",
      "description=Review: APPROVE (carried forward from aaaaaaa)",
      "-f",
      `target_url=${COMMENT_URL}`,
    ]);
    const body = (comment.find((a) => a.startsWith("body=")) as string).slice(5);
    expect(body).toContain(`**No agent ran on the new head`);
    expect(body).toContain(`Old head: ${OLD}`);
    expect(body).toContain(`New head: ${HEAD}`);
    expect(body).toContain(`> ${OK}`);
    expect(body).toContain("`scripts/carry-forward.ts`");
    expect(body).toContain("`docs/agent-workflow.md`");
    expect(body).toContain(`[QA report](${QA_URL})`);
    expect(body).toContain(`[review](${REVIEW_URL})`);
    expect(body).toContain("all 2 check runs completed and succeeded");
    expect(r.out).toContain("verified: both statuses are on");
  });

  it("exits non-zero when the statuses aren't there after posting", () => {
    const w = world();
    w.statusesStick = false;
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/did not stick.*agent\/qa, agent\/review/);
  });

  it("refuses when the head moves between the checks and the post", () => {
    const w = world();
    w.headLater = "f".repeat(40);
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/changed during the checks/);
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses when the PR is closed between the checks and the post", () => {
    const w = world();
    w.stateLater = "closed";
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/changed during the checks \(now closed/);
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses when an agent posts FAIL, BLOCK or pending on the head during the checks", () => {
    for (const state of ["failure", "pending"]) {
      const w = world();
      w.headStatusesLater = [
        {
          context: "agent/review",
          state,
          description: "Review: BLOCK",
          target_url: null,
          creator: bot,
        },
      ];
      const r = run(POST, w);
      expect(r.code).toBe(1);
      expect(r.err).toContain(`refused: agent/review on bbbbbbb is now ${state}`);
      expect(r.fake.writes()).toEqual([]);
    }
  });

  it("exits non-zero when the statuses stuck with a different link", () => {
    const w = world();
    w.storedTargetUrl = "https://github.com/x/y/pull/7#issuecomment-other";
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/did not stick.*agent\/qa, agent\/review/);
  });

  it("refuses when the head isn't the --head commit given", () => {
    const r = run(["7", "--head", "fffffff"]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not the --head fffffff/);
  });

  it("refuses a PR that isn't open", () => {
    const w = world();
    w.pr.state = "closed";
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("PR is not open");
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses when a PR file differs between the heads, and lists it", () => {
    const w = world();
    w.filesAtNew = [prFiles()[0] as File, { ...(prFiles()[1] as File), sha: "changed" }];
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/3\. FAIL/);
    expect(r.out).toContain("docs/agent-workflow.md: differs between the two heads");
    expect(r.out).not.toContain("scripts/carry-forward.ts: differs");
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses an extra or a missing PR file, and lists it", () => {
    const extra = world();
    extra.filesAtNew = [...prFiles(), { filename: "src/App.tsx", status: "modified", sha: "x" }];
    const a = run(POST, extra);
    expect(a.code).toBe(1);
    expect(a.out).toContain("src/App.tsx: changed by the PR at bbbbbbb but not at aaaaaaa");

    const missing = world();
    missing.filesAtNew = [prFiles()[0] as File];
    const b = run(POST, missing);
    expect(b.code).toBe(1);
    expect(b.out).toContain(
      "docs/agent-workflow.md: changed by the PR at aaaaaaa but not at bbbbbbb",
    );
    expect([...a.fake.writes(), ...b.fake.writes()]).toEqual([]);
  });

  it("refuses when the base branch also changed one of the PR's files, and lists it", () => {
    const w = world();
    w.baseChanged = [{ filename: "docs/agent-workflow.md", status: "modified", sha: "z" }];
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("docs/agent-workflow.md: also changed on v2 since aaaaaaa");
    expect(r.fake.writes()).toEqual([]);
  });

  it("compares a renamed file by its old name too", () => {
    const w = world();
    const renamed = (from: string): File => ({
      filename: "scripts/x.ts",
      status: "renamed",
      sha: "same",
      previous_filename: from,
    });
    w.filesAtOld = [...prFiles(), renamed("scripts/y.ts")];
    w.filesAtNew = [...prFiles(), renamed("scripts/z.ts")];
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("scripts/x.ts: differs between the two heads");
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses when the base renamed a PR file away, or touched a PR rename's old name", () => {
    // The base renamed one of the PR's files to a new name.
    const away = world();
    away.baseChanged = [
      {
        filename: "docs/moved.md",
        status: "renamed",
        sha: "f2",
        previous_filename: "docs/agent-workflow.md",
      },
    ];
    const a = run(POST, away);
    expect(a.code).toBe(1);
    expect(a.out).toContain("docs/agent-workflow.md: also changed on v2 since aaaaaaa");

    // The PR renames y.ts to x.ts; the base edited y.ts in the meantime.
    const oldName = world();
    const rename: File = {
      filename: "scripts/x.ts",
      status: "renamed",
      sha: "same",
      previous_filename: "scripts/y.ts",
    };
    oldName.filesAtOld = [...prFiles(), rename];
    oldName.filesAtNew = [...prFiles(), rename];
    oldName.baseChanged = [{ filename: "scripts/y.ts", status: "modified", sha: "z" }];
    const b = run(POST, oldName);
    expect(b.code).toBe(1);
    expect(b.out).toContain("scripts/y.ts: also changed on v2 since aaaaaaa");
    expect([...a.fake.writes(), ...b.fake.writes()]).toEqual([]);
  });

  it("refuses when the old statuses aren't both success", () => {
    const w = world();
    w.statuses[OLD] = pass().map((s) =>
      s.context === "agent/review" ? { ...s, state: "failure", description: "Review: BLOCK" } : s,
    );
    const auto = run(POST, w);
    expect(auto.code).toBe(1);
    expect(auto.out).toMatch(/no earlier commit on the PR has agent\/qa and agent\/review both/);
    const named = run([...POST, "--old", OLD.slice(0, 7)], w);
    expect(named.code).toBe(1);
    expect(named.out).toContain('agent/review on aaaaaaa is failure "Review: BLOCK", not success');
    expect([...auto.fake.writes(), ...named.fake.writes()]).toEqual([]);
  });

  it("refuses to carry from statuses that were themselves carried or overridden (no chains)", () => {
    for (const description of [
      "QA: PASS (carried forward from 1111111)",
      "Carried by Tuan from 1111111 (QA PASS)",
      "Override by Tuan: low risk (docs only)",
    ]) {
      const w = world();
      w.statuses[OLD] = pass().map((s) => (s.context === "agent/qa" ? { ...s, description } : s));
      const auto = run(POST, w);
      expect(auto.code).toBe(1);
      const named = run([...POST, "--old", OLD], w);
      expect(named.code).toBe(1);
      expect(named.out).toContain("not an agent's own verdict");
      expect([...auto.fake.writes(), ...named.fake.writes()]).toEqual([]);
    }
  });

  it("only carries a PASS/APPROVE posted by the bot in an agent's own words", () => {
    const refused: [string, string, string][] = [
      // [context, description, creator]
      ["agent/qa", "No agent run: bot token expired; Tuan tested locally", "tuanhoang0117"],
      ["agent/qa", "No agent run: bot token expired; Tuan tested locally", BOT],
      ["agent/qa", "QA: PASS", "tuanhoang0117"],
      ["agent/review", "Review: APPROVE", "someone-else"],
      ["agent/qa", "lgtm", BOT],
      ["agent/review", "Review: APPROVED", BOT],
      ["agent/qa", "QA: PASSED", BOT],
      ["agent/qa", "QA: PASS (carried forward from 1111111)", BOT],
    ];
    for (const [context, description, login] of refused) {
      const w = world();
      w.statuses[OLD] = pass().map((s) =>
        s.context === context ? { ...s, description, creator: { login } } : s,
      );
      const auto = run(POST, w);
      expect(auto.code, `${context} "${description}" by ${login}`).toBe(1);
      expect(auto.out).toMatch(/no earlier commit on the PR has agent\/qa and agent\/review both/);
      const named = run([...POST, "--old", OLD], w);
      expect(named.code).toBe(1);
      expect(named.out).toContain(`by ${login}, not an agent's own verdict`);
      expect([...auto.fake.writes(), ...named.fake.writes()]).toEqual([]);
    }

    // A combined agent's note after the verdict, and APPROVE WITH SUGGESTIONS, both count.
    for (const argv of [POST, [...POST, "--old", OLD]]) {
      const w = world();
      w.statuses[OLD] = pass().map((s) => ({
        ...s,
        description:
          s.context === "agent/qa"
            ? "QA: PASS (combined medium-tier agent, Claude Opus 5.5)"
            : s.context === "agent/review"
              ? "Review: APPROVE WITH SUGGESTIONS (combined medium-tier agent, Claude Opus 5.5)"
              : s.description,
      }));
      const r = run(argv, w);
      expect(r.code).toBe(0);
      expect(r.fake.writes()).toHaveLength(3);
    }
  });

  it("judges each context by its newest status only", () => {
    const w = world();
    // An agent PASS, then a later BLOCK on the same commit: the BLOCK is what stands.
    w.statuses[OLD] = [
      {
        context: "agent/review",
        state: "failure",
        description: "Review: BLOCK",
        target_url: null,
        creator: bot,
      },
      ...pass(),
    ];
    const r = run([...POST, "--old", OLD], w);
    expect(r.code).toBe(1);
    expect(r.out).toContain('agent/review on aaaaaaa is failure "Review: BLOCK", not success');
  });

  it("reads every page of statuses", () => {
    const w = world();
    w.pageSize = 1;
    // Newest first: the review verdict is on the second page.
    const r = run(POST, w);
    expect(r.code).toBe(0);
  });

  it("refuses when a commit after the old one has a FAIL or BLOCK, with or without --old", () => {
    const w = world();
    w.commits = [FIRST, OLD, MID, HEAD];
    w.statuses[MID] = [
      {
        context: "agent/qa",
        state: "failure",
        description: "QA: FAIL",
        target_url: null,
        creator: bot,
      },
    ];
    for (const argv of [POST, [...POST, "--old", OLD.slice(0, 7)]]) {
      const r = run(argv, w);
      expect(r.code).toBe(1);
      expect(r.out).toContain('refused: agent/qa on ccccccc is failure "QA: FAIL"');
      expect(r.fake.writes()).toEqual([]);
    }
  });

  it("refuses when the head already has both statuses as success", () => {
    const w = world();
    w.statuses[HEAD] = pass();
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("the head bbbbbbb already has both statuses as success");
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses when the PR or the base changed 300+ files, too many to verify", () => {
    const many = (prefix: string): File[] =>
      Array.from({ length: 300 }, (_, i) => ({
        filename: `${prefix}/f${i}.ts`,
        status: "modified",
        sha: `s${i}`,
      }));
    const pr = world();
    pr.filesAtOld = many("src");
    pr.filesAtNew = many("src");
    const a = run(POST, pr);
    expect(a.code).toBe(1);
    expect(a.out).toContain("the PR changes 300+ files; too many to verify");

    const base = world();
    base.baseChanged = many("other");
    const b = run(POST, base);
    expect(b.code).toBe(1);
    expect(b.out).toContain("the base changed 300+ files; too many to verify");
    expect([...a.fake.writes(), ...b.fake.writes()]).toEqual([]);
  });

  it("refuses failing CI, even with --allow-pending-ci", () => {
    const w = world();
    (w.runs[1] as Run).conclusion = "failure";
    for (const argv of [POST, [...POST, "--allow-pending-ci"]]) {
      const r = run(argv, w);
      expect(r.code).toBe(1);
      expect(r.out).toContain("failed: E2E (Playwright + axe) (failure)");
      expect(r.fake.writes()).toEqual([]);
    }
  });

  it("reads every page of CI runs", () => {
    const w = world();
    w.pageSize = 1;
    (w.runs[1] as Run).conclusion = "failure";
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("failed: E2E (Playwright + axe) (failure)");
    expect(r.fake.writes()).toEqual([]);
  });

  it("refuses when there are no CI runs on the new head", () => {
    const w = world();
    w.runs = [];
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("no CI check runs on the new head yet");
  });

  it("refuses pending CI unless --allow-pending-ci, and then says CI was still running", () => {
    const w = world();
    w.runs[1] = { name: "E2E (Playwright + axe)", status: "in_progress", conclusion: null };
    const refused = run(POST, w);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("still running: E2E (Playwright + axe)");
    expect(refused.fake.writes()).toEqual([]);

    const allowed = run([...POST, "--allow-pending-ci"], w);
    expect(allowed.code).toBe(0);
    const body = (allowed.fake.writes()[0] as string[]).find((a) =>
      a.startsWith("body="),
    ) as string;
    expect(body).toContain("CI was still running when this was posted: `E2E (Playwright + axe)`");
  });

  it("never prints the token, even when gh's error output contains it", () => {
    const happy = run(POST);
    expect(happy.all).not.toContain(TOKEN);
    const w = world();
    w.throwOn = "check-runs";
    const failed = run(POST, w);
    expect(failed.code).toBe(1);
    expect(failed.err).toContain("Bad credentials");
    expect(failed.err).toContain("[redacted]");
    expect(failed.all).not.toContain(TOKEN);
    expect(redact(`github_pat_${"A1".repeat(15)} and ${TOKEN}`, {})).toBe(
      "[redacted] and [redacted]",
    );
  });

  describe("verdict wording", () => {
    const status = (context: string, description: string, state = "success", login = BOT) => ({
      context,
      state,
      description,
      target_url: null,
      creator: { login },
    });

    // Every distinct success description tuanhoang-bot posted on agent/* across the 64 most recent
    // PRs (collected 2026-11-07), minus the bot's own carries, which must never count, and minus
    // Codex's wordings, which Tuan dropped on 2026-11-08 (they're in the refused list below).
    const realAgentVerdicts: [Context, string][] = [
      ["agent/qa", "QA: PASS"],
      ["agent/qa", "QA: PASS (combined medium-risk check)"],
      ["agent/qa", "QA: PASS (combined medium-tier agent, Claude Opus 5.5)"],
      ["agent/review", "Review: APPROVE"],
      ["agent/review", "Review: APPROVE WITH SUGGESTIONS"],
      ["agent/review", "Review: APPROVE WITH SUGGESTIONS (6bb857e only)"],
      ["agent/review", "Review: APPROVE WITH SUGGESTIONS (combined medium-risk check)"],
      [
        "agent/review",
        "Review: APPROVE WITH SUGGESTIONS (combined medium-tier agent, Claude Opus 5.5)",
      ],
    ];

    it("accepts every real agent verdict from recent PRs", () => {
      for (const [ctx, description] of realAgentVerdicts) {
        expect(isOwnVerdict(ctx, status(ctx, description)), description).toBe(true);
      }
    });

    it("refuses wording that only starts like a verdict, or isn't one", () => {
      const refused: [Context, string][] = [
        ["agent/qa", "QA: PASS but e2e failing"],
        ["agent/review", "Review: APPROVE WITH CHANGES REQUIRED"],
        ["agent/review", "Review: APPROVE pending a re-check"],
        ["agent/qa", "QA: PASS "],
        ["agent/qa", "QA: PASS (combined medium-tier agent) but e2e failing"],
        ["agent/qa", "QA: PASS (combined e2e failing)"],
        ["agent/qa", "QA: PASS (combined medium-tier agent, Claude says e2e failing)"],
        // Codex's wordings, dropped 2026-11-08, and the near miss that got through them.
        ["agent/qa", "QA: PASS — OpenAI Codex, GPT-6"],
        ["agent/qa", "QA: PASS — OpenAI Codex, GPT-6 but e2e failing"],
        ["agent/review", "Review: APPROVE WITH SUGGESTIONS (OpenAI Codex, GPT-6)"],
        ["agent/review", "Review: APPROVE WITH SUGGESTIONS — OpenAI Codex, GPT-6"],
        ["agent/review", "Review: APPROVE (OpenAI Codex, GPT-6 but tests failing)"],
        ["agent/qa", "QA: PASS (lead says fine)"],
        ["agent/qa", "QA: PASS — Tuan"],
        ["agent/qa", "Not QA: PASS"],
        ["agent/review", "Not Review: APPROVE"],
        ["agent/qa", "QA: PASS (carried forward from 3d2b217)"],
        ["agent/review", "Review: APPROVE WITH SUGGESTIONS (carried forward from 8e5793b)"],
        ["agent/review", "Review: BLOCK (combined medium-tier agent, Claude Opus 5.5)"],
        // A QA verdict on the review context, and the other way round.
        ["agent/review", "QA: PASS"],
        ["agent/qa", "Review: APPROVE"],
      ];
      for (const [ctx, description] of refused) {
        expect(isOwnVerdict(ctx, status(ctx, description)), description).toBe(false);
      }
    });

    it("refuses a PASS wording whose status isn't success, or that Tuan posted", () => {
      for (const state of ["failure", "pending", "error"]) {
        expect(isOwnVerdict("agent/qa", status("agent/qa", "QA: PASS", state)), state).toBe(false);
      }
      expect(
        isOwnVerdict("agent/qa", status("agent/qa", "QA: PASS", "success", "tuanhoang0117")),
      ).toBe(false);
    });

    it("refuses a near-verdict on the old commit end to end, with or without --old", () => {
      for (const description of ["QA: PASS but e2e failing", "Not QA: PASS"]) {
        const w = world();
        w.statuses[OLD] = pass().map((s) => (s.context === "agent/qa" ? { ...s, description } : s));
        expect(run(POST, w).code, description).toBe(1);
        const named = run([...POST, "--old", OLD], w);
        expect(named.code).toBe(1);
        expect(named.out).toContain(`agent/qa on aaaaaaa is success "${description}"`);
        expect(named.fake.writes()).toEqual([]);
      }
    });
  });

  it("refuses at check time when the head already has an agent FAIL or BLOCK", () => {
    const w = world();
    w.statuses[HEAD] = [
      {
        context: "agent/review",
        state: "failure",
        description: "Review: BLOCK",
        target_url: null,
        creator: bot,
      },
    ];
    for (const argv of [["7"], ["7", "--print-owner-commands", "--owner-ok", OK]]) {
      const r = run(argv, w);
      expect(r.code).toBe(1);
      expect(r.out).toContain('refused: agent/review on bbbbbbb is failure "Review: BLOCK"');
      expect(r.out).not.toContain("gh api -X POST");
    }
  });

  it("refuses when a commit after the old one has a pending agent status", () => {
    const w = world();
    w.commits = [FIRST, OLD, MID, HEAD];
    w.statuses[MID] = [
      {
        context: "agent/review",
        state: "pending",
        description: "Review in progress",
        target_url: null,
        creator: bot,
      },
    ];
    for (const argv of [["7"], ["7", "--old", OLD]]) {
      const r = run(argv, w);
      expect(r.code).toBe(1);
      expect(r.out).toContain('refused: agent/review on ccccccc is pending "Review in progress"');
    }
  });

  it("ignores statuses outside agent/* on the head and on later commits", () => {
    const w = world();
    w.commits = [FIRST, OLD, MID, HEAD];
    const other = (state: string): Status => ({
      context: "other/deploy",
      state,
      description: "unrelated",
      target_url: null,
      creator: bot,
    });
    w.statuses[MID] = [other("failure")];
    w.statuses[HEAD] = [other("pending")];
    const r = run(["7"], w);
    expect(r.code).toBe(0);
    expect(r.out).toContain("2. PASS");
  });

  it("refuses CI that completed with any conclusion but success", () => {
    for (const conclusion of ["cancelled", "timed_out", "action_required", "startup_failure"]) {
      const w = world();
      (w.runs[1] as Run).conclusion = conclusion;
      const r = run(["7"], w);
      expect(r.code, conclusion).toBe(1);
      expect(r.out).toContain(`failed: E2E (Playwright + axe) (${conclusion})`);
    }
  });

  it("refuses when a PR file's change type differs between the heads, even with the same blob", () => {
    const w = world();
    w.filesAtNew = [{ ...(prFiles()[0] as File), status: "modified" }, prFiles()[1] as File];
    const r = run(["7"], w);
    expect(r.code).toBe(1);
    expect(r.out).toContain("scripts/carry-forward.ts: differs between the two heads");
  });

  describe("--print-owner-commands", () => {
    const ownerScript = (ownerOk = OK) => {
      const r = run(["7", "--print-owner-commands", "--owner-ok", ownerOk]);
      expect(r.code).toBe(0);
      expect(r.fake.writes()).toEqual([]);
      return { r, script: r.out.slice(r.out.indexOf("\n(\n") + 1) };
    };

    /** What GitHub holds while the printed commands run. */
    function ownerWorld() {
      return {
        pr: { state: "open", head: HEAD },
        // Statuses per commit, newest first, as the combined-status endpoint sees them.
        statuses: { [HEAD]: [] } as Record<string, Omit<Status, "creator">[]>,
        comment: "ok" as "ok" | "fail" | "no-url",
        // A status write for this context fails.
        failContext: undefined as string | undefined,
        statusesStick: true,
        storedTargetUrl: undefined as string | undefined,
      };
    }
    type OwnerWorld = ReturnType<typeof ownerWorld>;

    /**
     * A fake `gh` for the printed commands. It answers like GitHub's API (pull, combined status,
     * comment and status writes), keeps posted statuses so they can be read back, and applies
     * `--jq` with the real `jq`, so the printed jq expressions run for real. `-f` sends a raw
     * string and `-F body=@file` reads the file, as in `gh api`.
     */
    const FAKE_GH = String.raw`
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { FAKE_GH_STATE: stateFile, FAKE_GH_LOG: log } = process.env;
const w = JSON.parse(readFileSync(stateFile, "utf8"));
const args = process.argv.slice(2);
const after = (flag) => args.flatMap((a, i) => (args[i - 1] === flag ? [a] : []));
const pairs = (flag) =>
  Object.fromEntries(after(flag).map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
const raw = pairs("-f");
const typed = pairs("-F");
const body = typed.body?.startsWith("@") ? readFileSync(typed.body.slice(1), "utf8") : (typed.body ?? raw.body);
appendFileSync(log, JSON.stringify({ args, body }) + "\n");
const path = args.find((a) => a.startsWith("repos/")).split("?")[0];
const method = after("-X")[0] ?? "GET";
const API = "${API}";
let m;
let out;
if (method === "GET" && path === API + "/pulls/7") {
  out = { state: w.pr.state, html_url: "https://github.com/x/y/pull/7", head: { sha: w.pr.head }, base: { ref: "v2" } };
} else if (method === "GET" && (m = new RegExp("^" + API + "/commits/([0-9a-f]+)/status$").exec(path))) {
  const latest = new Map();
  for (const s of w.statuses[m[1]] ?? []) if (!latest.has(s.context)) latest.set(s.context, s);
  out = { state: "pending", sha: m[1], total_count: latest.size, statuses: [...latest.values()] };
} else if (method === "POST" && path === API + "/issues/7/comments") {
  if (w.comment === "fail") { process.stderr.write("HTTP 403\n"); process.exit(1); }
  out = { id: 1, html_url: w.comment === "no-url" ? "" : "${COMMENT_URL}" };
} else if (method === "POST" && (m = new RegExp("^" + API + "/statuses/([0-9a-f]+)$").exec(path))) {
  if (raw.context === w.failContext) { process.stderr.write("HTTP 422\n"); process.exit(1); }
  if (w.statusesStick) {
    (w.statuses[m[1]] ??= []).unshift({
      context: raw.context, state: raw.state, description: raw.description,
      target_url: w.storedTargetUrl ?? raw.target_url,
    });
    writeFileSync(stateFile, JSON.stringify(w));
  }
  out = { id: 2, state: raw.state, context: raw.context };
} else {
  process.stderr.write("fake gh: no route for " + args.join(" ") + "\n");
  process.exit(1);
}
if (args.includes("--silent")) process.exit(0);
const jq = after("--jq")[0];
const json = JSON.stringify(out);
process.stdout.write(jq ? execFileSync("jq", ["-r", jq], { input: json, encoding: "utf8" }) : json + "\n");
`;

    /** Runs the printed commands in real bash, with the fake `gh` first on PATH. */
    function runOwner(script: string, w: OwnerWorld = ownerWorld()) {
      const dir = mkdtempSync(join(tmpdir(), "carry-forward-test-"));
      try {
        const log = join(dir, "log");
        const stateFile = join(dir, "state.json");
        writeFileSync(log, "");
        writeFileSync(stateFile, JSON.stringify(w));
        writeFileSync(join(dir, "gh"), `#!${process.execPath}\n${FAKE_GH}`);
        chmodSync(join(dir, "gh"), 0o755);
        let ok = true;
        let stdout = "";
        let stderr = "";
        try {
          stdout = execFileSync("bash", ["-c", script], {
            env: {
              PATH: `${dir}:${process.env.PATH}`,
              HOME: "/nonexistent",
              FAKE_GH_STATE: stateFile,
              FAKE_GH_LOG: log,
            },
            encoding: "utf8",
            stdio: "pipe",
          });
        } catch (e) {
          ok = false;
          stdout = String((e as { stdout?: string }).stdout ?? "");
          stderr = String((e as { stderr?: string }).stderr ?? "");
        }
        const calls = readFileSync(log, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { args: string[]; body?: string });
        const posts = calls.filter((c) => c.args.includes("POST"));
        const statusPosts = posts.filter((c) => c.args.some((a) => a.includes("/statuses/")));
        const comment = posts.find((c) => c.args.some((a) => a.endsWith("/issues/7/comments")));
        const final = JSON.parse(readFileSync(stateFile, "utf8")) as OwnerWorld;
        return { ok, stdout, stderr, calls, posts, statusPosts, comment, final };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it("needs jq, which the tests use to run the printed --jq expressions for real", () => {
      expect(() => execFileSync("jq", ["--version"], { stdio: "pipe" })).not.toThrow();
    });

    it("needs --owner-ok and runs every refusal check, writing nothing", () => {
      expect(run(["7", "--print-owner-commands"]).code).toBe(2);
      const w = world();
      w.filesAtNew = [prFiles()[0] as File];
      const r = run(["7", "--print-owner-commands", "--owner-ok", OK], w);
      expect(r.code).toBe(1);
      expect(r.out).not.toContain("gh api -X POST");
      expect(r.fake.writes()).toEqual([]);
    });

    it("prints commands that post the same comment and statuses with Tuan's own gh", () => {
      const tricky = `Tuan said "carry it over" on 2026-10-26; it's fine $HOME \`x\` (#7)`;
      const { r, script } = ownerScript(tricky);
      expect(r.out).not.toContain("as-bot");
      const o = runOwner(script);
      expect(o.stderr).toBe("");
      expect(o.ok).toBe(true);
      expect(o.statusPosts.map((c) => c.args.filter((a) => a.includes("=")))).toEqual([
        [
          "state=success",
          "context=agent/qa",
          "description=QA: PASS (carried forward from aaaaaaa)",
          `target_url=${COMMENT_URL}`,
        ],
        [
          "state=success",
          "context=agent/review",
          "description=Review: APPROVE (carried forward from aaaaaaa)",
          `target_url=${COMMENT_URL}`,
        ],
      ]);
      expect(o.posts[0]).toBe(o.comment);
      expect(o.comment?.body).toContain(`> ${tricky}\n`);
      expect(o.comment?.body).toContain("**No agent ran on the new head");
      expect(o.comment?.body).toContain("Posted by: Tuan, from his own account");
      expect(o.stdout).toContain(`comment: ${COMMENT_URL}`);
      expect(o.stdout).toContain(`verified: both statuses are on ${HEAD}`);
    });

    it("sends the comment body as a file with -F, not as a literal string", () => {
      const o = runOwner(ownerScript().script);
      expect(o.ok).toBe(true);
      const args = o.comment?.args ?? [];
      const flag = args[args.findIndex((a) => a.startsWith("body=")) - 1];
      expect(flag).toBe("-F");
      expect(args.find((a) => a.startsWith("body="))).toMatch(/^body=@\//);
      expect(o.comment?.body).toContain("### Agent verdicts carried forward from `aaaaaaa`");
    });

    it("the printed commands stop before posting if the head has moved", () => {
      const w = ownerWorld();
      w.pr.head = "f".repeat(40);
      const o = runOwner(ownerScript().script, w);
      expect(o.ok).toBe(false);
      expect(o.stderr).toContain(`PR #7 closed or head moved (now: open ${"f".repeat(40)})`);
      expect(o.posts).toEqual([]);
    });

    it("the printed commands stop before posting if the PR was closed", () => {
      const w = ownerWorld();
      w.pr.state = "closed";
      const o = runOwner(ownerScript().script, w);
      expect(o.ok).toBe(false);
      expect(o.stderr).toContain(`PR #7 closed or head moved (now: closed ${HEAD})`);
      expect(o.posts).toEqual([]);
    });

    it("the printed commands stop if an agent status that isn't success is on the head", () => {
      for (const [state, description] of [
        ["failure", "Review: BLOCK"],
        ["pending", "Review in progress"],
      ] as const) {
        const w = ownerWorld();
        w.statuses[HEAD] = [
          { context: "other/deploy", state: "success", description: "ok", target_url: null },
          { context: "agent/review", state, description, target_url: null },
        ];
        const o = runOwner(ownerScript().script, w);
        expect(o.ok, state).toBe(false);
        expect(o.stderr).toContain(`the head now has agent/review ${state}; not posting`);
        expect(o.posts).toEqual([]);
      }
    });

    it("the printed commands ignore statuses outside agent/* on the head", () => {
      const w = ownerWorld();
      w.statuses[HEAD] = [
        { context: "other/deploy", state: "pending", description: "deploying", target_url: null },
      ];
      const o = runOwner(ownerScript().script, w);
      expect(o.stderr).toBe("");
      expect(o.ok).toBe(true);
    });

    it("the printed commands post no status if the comment fails or returns no link", () => {
      for (const comment of ["fail", "no-url"] as const) {
        const w = ownerWorld();
        w.comment = comment;
        const o = runOwner(ownerScript().script, w);
        expect(o.ok, comment).toBe(false);
        expect(o.statusPosts).toEqual([]);
      }
    });

    it("the printed commands stop after the first status write that fails", () => {
      const w = ownerWorld();
      w.failContext = "agent/qa";
      const o = runOwner(ownerScript().script, w);
      expect(o.ok).toBe(false);
      expect(o.calls.some((c) => c.args.includes("context=agent/review"))).toBe(false);
    });

    it("the printed commands exit non-zero if the statuses didn't stick", () => {
      const lost = ownerWorld();
      lost.statusesStick = false;
      const a = runOwner(ownerScript().script, lost);
      expect(a.ok).toBe(false);
      expect(a.stderr).toContain(`agent/qa did not stick on ${HEAD} (now: ); check GitHub`);
      expect(a.stdout).not.toContain("verified");

      const otherLink = ownerWorld();
      otherLink.storedTargetUrl = "https://github.com/x/y/pull/7#issuecomment-other";
      const b = runOwner(ownerScript().script, otherLink);
      expect(b.ok).toBe(false);
      expect(b.stderr).toContain("agent/qa did not stick");
      expect(b.stdout).not.toContain("verified");
    });

    it("the printed check reads back each context, not just the first one", () => {
      // The review status is posted but replaced by a BLOCK before the read-back.
      const w = ownerWorld();
      const { script } = ownerScript();
      const blocked = script.replace(
        /(gh api -X POST [^\n]*context=agent\/review[^\n]*)/,
        `$1\ngh api -X POST ${API}/statuses/${HEAD} -f state=failure -f context=agent/review -f description='Review: BLOCK' -f target_url=x --silent`,
      );
      expect(blocked).not.toBe(script);
      const o = runOwner(blocked, w);
      expect(o.ok).toBe(false);
      expect(o.stderr).toContain(
        `agent/review did not stick on ${HEAD} (now: failure x Review: BLOCK)`,
      );
    });
  });
});
