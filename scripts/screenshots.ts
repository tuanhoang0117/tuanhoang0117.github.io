/**
 * Screenshots routes of the production build at desktop and 375px mobile widths.
 *
 *   npm run screenshots -- /contact /resume
 *
 * Writes full-page PNGs to screenshots/ (gitignored). Publish them to a PR with
 * scripts/publish-screenshots.ts.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

// Parallel agents each set their own SCREENSHOT_PORT so their preview servers don't collide.
const PORT = Number(process.env.SCREENSHOT_PORT ?? 4322);
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 740 },
};

const routes = process.argv.slice(2);
if (routes.length === 0 || routes.some((r) => !r.startsWith("/"))) {
  console.error("usage: npm run screenshots -- /route [/route ...]");
  process.exit(2);
}

function slug(route: string): string {
  return route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Server not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server didn't start at ${url}`);
}

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
});

try {
  await waitForServer(BASE);
  await rm("screenshots", { recursive: true, force: true });
  await mkdir("screenshots");
  const browser = await chromium.launch();

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport });
    for (const route of routes) {
      await page.goto(BASE + route);
      // Full-page shots include content below the fold, so load lazy images up front.
      await page.evaluate(() => {
        for (const img of document.querySelectorAll("img")) img.loading = "eager";
      });
      await page.waitForLoadState("networkidle");
      const file = `screenshots/${slug(route)}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await page.close();
  }

  await browser.close();
} finally {
  server.kill();
}
