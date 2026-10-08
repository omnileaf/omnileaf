import type { Page, Request } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

const VERSION_FILE = "/_app/version.json";
const LONGER_THAN_AN_HOUR = "01:00:01";

function isVersionCheck(request: Request): boolean {
  return new URL(request.url()).pathname === VERSION_FILE;
}

function urlsOf(requests: readonly Request[]): string[] {
  return requests.map((request) => request.url());
}

function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  return requests;
}

async function openTheLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
}

test("never polls for a newer version while it stays open", async ({
  page,
}) => {
  await page.clock.install();
  const requests = recordRequests(page);
  await openTheLibrary(page);

  await page.clock.runFor(LONGER_THAN_AN_HOUR);

  expect(urlsOf(requests.filter(isVersionCheck))).toEqual([]);
});

test("checks its version only against itself when the window regains focus", async ({
  page,
}) => {
  const requests = recordRequests(page);
  await openTheLibrary(page);
  const appOrigin = new URL(page.url()).origin;

  const versionCheck = page.waitForRequest(isVersionCheck);
  await page.evaluate(() => window.dispatchEvent(new FocusEvent("focus")));
  await versionCheck;

  expect(
    urlsOf(requests).filter((url) => new URL(url).origin !== appOrigin),
  ).toEqual([]);
});
