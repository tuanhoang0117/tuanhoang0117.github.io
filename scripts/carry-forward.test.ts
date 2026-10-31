// @vitest-environment node
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, redact, REPO } from "./carry-forward.ts";

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

const pass = (): Status[] => [
  { context: "agent/qa", state: "success", description: "QA: PASS", target_url: QA_URL },
  {
    context: "agent/review",
    state: "success",
    description: "Review: APPROVE",
    target_url: REVIEW_URL,
  },
  { context: "other/ci", state: "success", description: "unrelated", target_url: null },
];

const prFiles = (): File[] => [
  { filename: "scripts/carry-forward.ts", status: "added", sha: "f1" },
  { filename: "docs/agent-workflow.md", status: "modified", sha: "f2" },
];

/** A PR whose head is a v2 merge on top of a commit both agents passed. */
function world() {
  return {
    pr: { state: "open", head: HEAD, base: "v2" },
    // The head as seen by every read after the first one (simulates a push mid-run).
    headLater: HEAD,
    commits: [FIRST, OLD, HEAD],
    statuses: { [FIRST]: [], [OLD]: pass(), [HEAD]: [] } as Record<string, Status[]>,
    filesAtOld: prFiles(),
    filesAtNew: prFiles(),
    baseChanged: [{ filename: "src/pages/Home.tsx", status: "modified", sha: "f9" }] as File[],
    runs: [
      { name: "Lint, format, typecheck, unit tests", status: "completed", conclusion: "success" },
      { name: "E2E (Playwright + axe)", status: "completed", conclusion: "success" },
    ] as Run[],
    // Set to false to drop status writes, as if GitHub lost them.
    statusesStick: true,
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
          target_url: field("target_url"),
        });
      }
      return "{}";
    }
    if (isWrite) throw new Error(`unexpected write ${args.join(" ")}`);
    if (path === `${API}/pulls/7`) {
      const head = prReads++ === 0 ? w.pr.head : w.headLater;
      return JSON.stringify({
        state: w.pr.state,
        html_url: "https://github.com/x/y/pull/7",
        head: { sha: head },
        base: { ref: w.pr.base },
      });
    }
    if (path === `${API}/pulls/7/commits`) {
      return JSON.stringify([w.commits.map((sha) => ({ sha }))]);
    }
    const status = /^.*\/commits\/([0-9a-f]+)\/status$/.exec(path);
    if (status) {
      // The combined status endpoint returns the newest status per context.
      const seen = new Set<string>();
      const latest = (w.statuses[status[1] as string] ?? []).filter((s) => {
        if (seen.has(s.context)) return false;
        seen.add(s.context);
        return true;
      });
      return JSON.stringify({ statuses: latest });
    }
    if (path.startsWith(`${API}/commits/${HEAD}/check-runs`)) {
      return JSON.stringify([{ check_runs: w.runs }]);
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
      expect(named.out).toContain("already carried or overridden");
      expect([...auto.fake.writes(), ...named.fake.writes()]).toEqual([]);
    }
  });

  it("refuses when a commit after the old one has a FAIL or BLOCK", () => {
    const w = world();
    w.commits = [FIRST, OLD, MID, HEAD];
    w.statuses[MID] = [
      { context: "agent/qa", state: "failure", description: "QA: FAIL", target_url: null },
    ];
    const r = run(POST, w);
    expect(r.code).toBe(1);
    expect(r.out).toContain('agent/qa on ccccccc is failure "QA: FAIL"');
    expect(r.fake.writes()).toEqual([]);
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

  describe("--print-owner-commands", () => {
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
      const r = run(["7", "--print-owner-commands", "--owner-ok", tricky]);
      expect(r.code).toBe(0);
      expect(r.fake.writes()).toEqual([]);
      expect(r.out).not.toContain("as-bot");
      const script = r.out.slice(r.out.indexOf("\n(\n") + 1);

      // Run the printed commands in real bash against a fake gh that records what it's sent.
      const dir = mkdtempSync(join(tmpdir(), "carry-forward-test-"));
      try {
        const log = join(dir, "log");
        writeFileSync(
          join(dir, "gh"),
          [
            "#!/usr/bin/env bash",
            `log=${log}`,
            'printf "%s\\0" "$@" >> "$log"; printf "\\n" >> "$log"',
            'for a in "$@"; do case "$a" in body=@*) cat "${a#body=@}" > "$log.body";; esac; done',
            `case "$*" in *pulls/7*) echo ${HEAD};; *issues/7/comments*) echo ${COMMENT_URL};; esac`,
          ].join("\n"),
        );
        chmodSync(join(dir, "gh"), 0o755);
        execFileSync("bash", ["-c", script], {
          env: { PATH: `${dir}:${process.env.PATH}`, HOME: "/nonexistent" },
          stdio: "pipe",
        });
        const calls = readFileSync(log, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\0").filter(Boolean));
        const statusCalls = calls.filter((c) => c.includes(`${API}/statuses/${HEAD}`));
        expect(statusCalls.map((c) => c.filter((a) => a.includes("=")))).toEqual([
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
        const body = readFileSync(`${log}.body`, "utf8");
        expect(body).toContain(`> ${tricky}\n`);
        expect(body).toContain("**No agent ran on the new head");
        expect(body).toContain("Posted by: Tuan, from his own account");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("the printed commands stop before posting if the head has moved", () => {
      const r = run(["7", "--print-owner-commands", "--owner-ok", OK]);
      const script = r.out.slice(r.out.indexOf("\n(\n") + 1);
      const dir = mkdtempSync(join(tmpdir(), "carry-forward-test-"));
      try {
        const log = join(dir, "log");
        writeFileSync(
          join(dir, "gh"),
          `#!/usr/bin/env bash\necho "$*" >> ${log}\necho ${"f".repeat(40)}\n`,
        );
        chmodSync(join(dir, "gh"), 0o755);
        expect(() =>
          execFileSync("bash", ["-c", script], {
            env: { PATH: `${dir}:${process.env.PATH}` },
            stdio: "pipe",
          }),
        ).toThrow(/head moved/);
        expect(readFileSync(log, "utf8")).not.toContain("POST");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
