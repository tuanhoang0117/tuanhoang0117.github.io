import { defineConfig, devices } from "@playwright/test";

// Dedicated port, separate from `npm run preview` (4173), so tests never hit a stale build.
const PORT = 4321;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // 375px: the narrowest common phone, and the width docs/design-system.md promises.
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 740 } } },
  ],
  // Tests always build and serve fresh. Reusing a running server once let a stale build pass
  // tests that should have failed.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
