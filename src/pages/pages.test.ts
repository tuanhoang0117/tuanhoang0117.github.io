/// <reference types="node" />
// Vitest runs in Node with the repo root as its working directory.
import { readdirSync, readFileSync } from "node:fs";
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
