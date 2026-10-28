// @vitest-environment node
/// <reference types="node" />
// Vitest runs in Node with the repo root as its working directory.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getFileInfo } from "prettier";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const pages = readdirSync("src/pages", { recursive: true, encoding: "utf8" }).filter(
  (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
);

describe("page prompts", () => {
  it.each(pages)("%s passes no typed string as its >>> prompt", (file) => {
    const source = readFileSync(`src/pages/${file}`, "utf8");
    expect(source).not.toMatch(/prompt="/);
  });
});

// Retired code under archive/ is kept only for restoring later (archive/hackathons-page/README.md).
// No tool may lint, format-check, typecheck, or run it.
describe("archive/ is outside every tool", () => {
  const ARCHIVE = resolve("archive");
  const inArchive = (file: string) => resolve(file).startsWith(`${ARCHIVE}/`);
  const archived = readdirSync("archive", { recursive: true, encoding: "utf8" })
    .map((f) => `archive/${f}`)
    .filter((f) => /\.(tsx?|md)$/.test(f));
  const bin = (name: string, args: string[]) =>
    execFileSync(`node_modules/.bin/${name}`, args, { encoding: "utf8", stdio: "pipe" });
  const SLOW = 60_000;

  it("holds code that the tools would otherwise pick up", () => {
    // Without these, every check below would pass on an empty folder.
    expect(archived.some((f) => f.endsWith(".test.tsx"))).toBe(true);
    expect(archived.some((f) => f.endsWith(".spec.ts"))).toBe(true);
  });

  it(
    "vitest collects no test file from it",
    () => {
      const files = (
        JSON.parse(bin("vitest", ["list", "--filesOnly", "--json"])) as { file: string }[]
      ).map((t) => t.file);
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter(inArchive)).toEqual([]);
    },
    SLOW,
  );

  it(
    "playwright lists no spec from it",
    () => {
      const report = JSON.parse(bin("playwright", ["test", "--list", "--reporter=json"])) as {
        config: { rootDir: string };
        suites: { file: string }[];
      };
      const files = report.suites.map((s) => resolve(report.config.rootDir, s.file));
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter(inArchive)).toEqual([]);
    },
    SLOW,
  );

  it(
    "oxlint lints none of it",
    () => {
      // When every path it was given is ignored, oxlint exits non-zero and prints a plain-text
      // line before its JSON report, so read the report from its first brace.
      let out: string;
      try {
        out = bin("oxlint", ["archive", "--format=json"]);
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const report = JSON.parse(out.slice(out.indexOf("{"))) as { number_of_files: number };
      expect(report.number_of_files).toBe(0);
    },
    SLOW,
  );

  it("prettier ignores all of it", async () => {
    for (const file of archived) {
      const info = await getFileInfo(file, { ignorePath: ".prettierignore" });
      expect(info.ignored, file).toBe(true);
    }
  });

  it("no tsconfig includes it", () => {
    const configs = (
      JSON.parse(readFileSync("tsconfig.json", "utf8")) as { references: { path: string }[] }
    ).references.map((r) => resolve(r.path));
    expect(configs.length).toBeGreaterThan(0);
    for (const config of configs) {
      const parsed = ts.getParsedCommandLineOfConfigFile(
        config,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: (d) => {
            throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
          },
        },
      )!;
      expect(parsed.fileNames.length, config).toBeGreaterThan(0);
      expect(parsed.fileNames.filter(inArchive), config).toEqual([]);
    }
  });
});
