import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { mascotCounterLabel, mascotLabel } from "../src/content/mascot";

// playwright.config.ts builds with this endpoint. Nothing listens there; tests stub it below.
const STUB = "http://127.0.0.1:9";

const mascot = (page: Page) => page.getByRole("button", { name: mascotLabel, exact: true });
const counter = (page: Page) =>
  page.getByRole("group", { name: mascotLabel }).locator("[data-mascot-counter]");
const overlay = (page: Page) => page.getByTestId("physics-overlay");

type Reply = { status: number; count?: number; headers?: Record<string, string> } | "abort";

/**
 * Stands in for the Worker at STUB. `reply` decides each request's answer; the stub keeps its own
 * tally of the increments it accepted, so a test can compare it with the presses.
 */
async function stubCounter(
  page: Page,
  start: number,
  reply: (req: { method: string; by?: number; index: number }) => Reply = () => ({ status: 200 }),
) {
  const server = { total: start, posts: [] as number[], accepted: [] as number[], reads: 0 };
  let index = 0;
  await page.route(`${STUB}/**`, async (route: Route) => {
    const request = route.request();
    const cors = {
      "Access-Control-Allow-Origin": (await request.headerValue("origin")) ?? "",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const by =
      request.method() === "POST" ? (request.postDataJSON() as { by: number }).by : undefined;
    if (by === undefined) server.reads += 1;
    else server.posts.push(by);
    const answer = reply({ method: request.method(), by, index: index++ });
    if (answer === "abort") return route.abort("connectionrefused");
    if (answer.status === 200 && by !== undefined) {
      server.total += by;
      server.accepted.push(by);
    }
    return route.fulfill({
      status: answer.status,
      headers: { ...cors, ...answer.headers },
      contentType: "application/json",
      body: JSON.stringify(
        answer.status === 200 ? { count: answer.count ?? server.total } : { error: "stub" },
      ),
    });
  });
  return server;
}

/** Every request that heads for the real Worker. Each is aborted, so none ever leaves. */
async function guardRealWorker(page: Page) {
  const escaped: string[] = [];
  await page.context().route(/workers\.dev/, (route) => {
    escaped.push(route.request().url());
    return route.abort();
  });
  page.on("request", (request: Request) => {
    if (/workers\.dev/.test(request.url())) escaped.push(request.url());
  });
  return escaped;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

test.describe("shared mascot counter", () => {
  let escaped: string[] = [];

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "The mustang mounts only at xl and above");
    escaped = await guardRealWorker(page);
  });

  test.afterEach(() => {
    expect(escaped, "requests to the real counter").toEqual([]);
  });

  test("shows the shared total, adds each press at once, and batches the increments", async ({
    page,
  }) => {
    const server = await stubCounter(page, 41);
    await page.goto("/");
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 41`);
    await expect(counter(page)).toHaveAttribute("data-counter-mode", "shared");

    for (let i = 1; i <= 5; i++) {
      await mascot(page).click();
      // Well inside the 1 s batch window: the press shows before anything is sent.
      await expect(counter(page)).toHaveText(`${mascotCounterLabel}: ${41 + i}`, {
        timeout: 300,
      });
    }
    await expect.poll(() => sum(server.posts)).toBe(5);
    expect(server.posts.length, "presses went out batched").toBeLessThan(5);
    expect(server.total).toBe(46);
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 46`);
    await expect(counter(page)).toHaveAttribute("aria-live", "polite");
    await expect(overlay(page)).toHaveAttribute("data-tokens", "5");
  });

  test("waits out a 429's Retry-After, then counts the presses once", async ({ page }) => {
    const server = await stubCounter(page, 10, ({ method, index }) =>
      method === "POST" && index === 1
        ? { status: 429, headers: { "Retry-After": "1" } }
        : { status: 200 },
    );
    await page.goto("/");
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 10`);
    for (let i = 0; i < 3; i++) await mascot(page).click();
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 13`);

    await expect.poll(() => server.accepted).toEqual([3]);
    expect(server.posts).toEqual([3, 3]);
    expect(server.total).toBe(13);
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 13`);
    await expect(counter(page)).toHaveAttribute("data-counter-mode", "shared");
  });

  test("never resends a batch whose request got no answer", async ({ page }) => {
    const server = await stubCounter(page, 10, ({ method, index }) =>
      method === "POST" && index === 1 ? "abort" : { status: 200 },
    );
    await page.goto("/");
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 10`);
    await mascot(page).click();
    await mascot(page).click();
    await expect.poll(() => server.posts).toEqual([2]);
    // The backoff retry re-reads the total instead of sending the 2 again.
    await expect.poll(() => server.reads).toBe(2);

    await mascot(page).click();
    await expect.poll(() => server.accepted).toEqual([1]);
    expect(server.posts).toEqual([2, 1]);
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 13`);
  });

  test("falls back to local counting when the service is down", async ({ page }) => {
    const server = await stubCounter(page, 0, () => "abort");
    await page.goto("/");
    await mascot(page).click();
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 1`);
    // Four tries in a row (backoff 1 s, 2 s, 4 s) before it gives up on the service.
    await expect(counter(page)).toHaveAttribute("data-counter-mode", "local", { timeout: 15_000 });
    const requests = server.reads + server.posts.length;

    await mascot(page).click();
    await mascot(page).press("Enter");
    await expect(counter(page)).toHaveText(`${mascotCounterLabel}: 3`);
    await expect(overlay(page)).toHaveAttribute("data-tokens", "3");
    await page.waitForTimeout(1500);
    expect(server.reads + server.posts.length, "no calls after falling back").toBe(requests);
  });

  test("the built site points at the test endpoint, never the real Worker", async ({ page }) => {
    // The build that serves this suite; playwright.config.ts sets VITE_COUNTER_URL for it.
    const assets = join(import.meta.dirname, "..", "dist", "assets");
    const scripts = readdirSync(assets)
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(join(assets, name), "utf8"));
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.some((code) => code.includes(STUB))).toBe(true);
    expect(scripts.filter((code) => code.includes("workers.dev"))).toEqual([]);

    // And an unstubbed page goes to the test endpoint, not the real one.
    const tried: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(STUB)) tried.push(request.url());
    });
    await page.goto("/");
    await expect.poll(() => tried).toContain(`${STUB}/count`);
  });
});
