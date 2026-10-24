/**
 * Uploads screenshots/*.png to the `screenshots` branch under pr-<number>/ and prints a Markdown
 * table to paste into a PR comment. Keeps images out of the code history.
 *
 *   scripts/as-bot.sh node scripts/publish-screenshots.ts 6
 *
 * Needs GH_TOKEN in the environment, which scripts/as-bot.sh provides.
 */
import { readdir, readFile } from "node:fs/promises";

const REPO = "tuanhoang0117/tuanhoang0117.github.io";
const BRANCH = "screenshots";

const pr = process.argv[2];
const token = process.env.GH_TOKEN;
if (!pr || !/^\d+$/.test(pr)) {
  console.error("usage: scripts/as-bot.sh node scripts/publish-screenshots.ts <pr-number>");
  process.exit(2);
}
if (!token) {
  console.error("GH_TOKEN is not set; run this through scripts/as-bot.sh");
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
};

async function upload(name: string): Promise<string> {
  const path = `pr-${pr}/${name}`;
  const url = `https://api.github.com/repos/${REPO}/contents/${path}`;

  // Re-running for the same PR replaces the old image, which requires its current sha.
  const existing = await fetch(`${url}?ref=${BRANCH}`, { headers });
  const sha = existing.ok ? ((await existing.json()) as { sha: string }).sha : undefined;

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Screenshots for PR #${pr}: ${name}`,
      content: (await readFile(`screenshots/${name}`)).toString("base64"),
      branch: BRANCH,
      ...(sha && { sha }),
    }),
  });
  if (!res.ok) throw new Error(`upload ${path} failed: ${res.status} ${await res.text()}`);

  // Cache-bust so a re-upload shows the new image instead of GitHub's cached copy.
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}?v=${Date.now()}`;
}

const files = (await readdir("screenshots")).filter((f) => f.endsWith(".png")).sort();
if (files.length === 0) {
  console.error("no screenshots/*.png; run npm run screenshots first");
  process.exit(1);
}

const byPage = new Map<string, { desktop?: string; mobile?: string }>();
for (const file of files) {
  const match = /^(.+)-(desktop|mobile)\.png$/.exec(file);
  if (!match) continue;
  const [, page, size] = match as unknown as [string, string, "desktop" | "mobile"];
  const entry = byPage.get(page) ?? {};
  entry[size] = await upload(file);
  byPage.set(page, entry);
}

console.log("| Page | Desktop | Mobile (375px) |");
console.log("| ---- | ------- | -------------- |");
for (const [page, { desktop, mobile }] of byPage) {
  const img = (src?: string) => (src ? `<img src="${src}" width="400">` : "");
  console.log(`| \`${page}\` | ${img(desktop)} | ${img(mobile)} |`);
}
