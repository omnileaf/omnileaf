import type { Page } from "@playwright/test";

import {
  expectHeadingFocused,
  expectHeadingNotFocused,
  heading,
  isPhone,
} from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES, REPORT_COUNT } from "./samples.ts";
import { openSignedIn } from "./sign-in.ts";
import { failOnce, REPORTS_API } from "./stubs.ts";

const SEARCH_WRITE_DELAY_MS = 150;
const CLOCK_START = new Date("2025-03-01T12:00:00Z");
const CLOCK_PAUSED_AT = new Date("2025-03-01T12:00:01Z");
const WRITES = "searchWrites";
const NEWEST_FIRST = [
  CODES.received,
  CODES.reviewing,
  CODES.published,
  CODES.otherPublished,
  CODES.duplicate,
  CODES.closed,
];

test.beforeEach(async ({ page }) => {
  await openSignedIn(page, "/admin/reports");
  await expect(heading(page)).toHaveText("Reports");
});

function rows(page: Page) {
  return page.getByRole("link", { name: /^R-/ });
}

test("the list shows every report, newest first, as a table or a list but never both", async ({
  page,
}) => {
  await expect(rows(page)).toHaveCount(REPORT_COUNT);
  expect(await rows(page).allTextContents()).toEqual(NEWEST_FIRST);
  await expect(page.getByText(`${String(REPORT_COUNT)} reports`)).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(isPhone(page) ? 0 : 1);
  await expect(page.getByText("Search and filter the newest 500")).toBeVisible({
    visible: !isPhone(page),
  });
});

for (const timezoneId of ["Pacific/Auckland", "America/Los_Angeles"]) {
  test.describe(`in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("received shows the UTC time", async ({ page }) => {
      await page.goto(`/admin/reports/${CODES.received}`);

      await expect(page.getByText("2025-03-01 12:05 UTC")).toBeVisible();
    });
  });
}

test("typing in the search box narrows the list, keeps focus and replaces the address @webkit", async ({
  page,
}) => {
  const search = page.getByRole("searchbox", { name: "Search" });
  const entries = await page.evaluate(() => history.length);

  await search.pressSequentially("ios");

  await expect(page).toHaveURL("/admin/reports?q=ios");
  await expect(rows(page)).toHaveText([CODES.published]);
  await expect(search).toBeFocused();
  await expectHeadingNotFocused(page);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await expect(
    page.getByText(`1 of ${String(REPORT_COUNT)} reports`),
  ).toBeVisible();
});

test("the address is written once, after a pause, and not on each key", async ({
  page,
}) => {
  await page.evaluate((name) => {
    const written: string[] = [];
    Reflect.set(globalThis, name, written);
    const original = history.replaceState.bind(history);
    history.replaceState = (state, unused, url) => {
      if (String(url).includes("q=")) {
        written.push(String(url));
      }
      original(state, unused, url);
    };
  }, WRITES);
  const searchWrites = (): Promise<string[]> =>
    page.evaluate((name) => {
      const written: unknown = Reflect.get(globalThis, name);
      return Array.isArray(written) ? written.map(String) : [];
    }, WRITES);
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(CLOCK_PAUSED_AT);
  const search = page.getByRole("searchbox", { name: "Search" });

  await search.pressSequentially("wi");
  await page.clock.runFor(SEARCH_WRITE_DELAY_MS - 50);
  await search.pressSequentially("n");
  await page.clock.runFor(SEARCH_WRITE_DELAY_MS - 1);

  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  expect(await searchWrites()).toEqual([]);
  await page.clock.runFor(1);
  await expect(page).toHaveURL("/admin/reports?q=win");
  expect(await searchWrites()).toHaveLength(1);
});

test("the search also matches an issue number", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search" }).fill("412");

  await expect(rows(page)).toHaveText([CODES.published]);
});

test("choosing a status, platform and version narrows the list and does not move focus", async ({
  page,
}) => {
  await page.getByLabel("Status").selectOption("published");
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel("Platform").selectOption("windows");
  await expect(rows(page)).toHaveText([CODES.otherPublished]);
  await page.getByLabel("App version").selectOption("1.3.2");

  await expect(page).toHaveURL(
    "/admin/reports?status=published&platform=windows&version=1.3.2",
  );
  await expectHeadingNotFocused(page);
});

test("a choice made right after typing keeps both @webkit", async ({
  page,
}) => {
  await page
    .getByRole("searchbox", { name: "Search" })
    .pressSequentially("ios");
  await page.getByLabel("Status").selectOption("published");

  await expect(page).toHaveURL("/admin/reports?q=ios&status=published");
  await expect(rows(page)).toHaveText([CODES.published]);
});

test("a search nothing matches says so and offers to clear the filters", async ({
  page,
}) => {
  await page.getByRole("searchbox", { name: "Search" }).fill("zzzz");

  await expect(page.getByText("No reports match")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).last().click();
  await expect(page).toHaveURL("/admin/reports");
  await expect(rows(page)).toHaveCount(REPORT_COUNT);
  await expectHeadingNotFocused(page);
});

test("clear filters empties the box and the choices", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search" }).fill("ios");
  await page.getByLabel("Status").selectOption("published");
  await expect(page).toHaveURL("/admin/reports?q=ios&status=published");

  await page.getByRole("button", { name: "Clear filters" }).click();

  await expect(page).toHaveURL("/admin/reports");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  await expect(page.getByLabel("Status")).toHaveValue("");
  await expect(rows(page)).toHaveCount(REPORT_COUNT);
});

test("reloading keeps the filter", async ({ page }) => {
  await page.getByLabel("Status").selectOption("closed");
  await page.getByRole("searchbox", { name: "Search" }).fill("macos");
  await expect(page).toHaveURL("/admin/reports?q=macos&status=closed");

  await page.reload();

  await expect(page.getByLabel("Status")).toHaveValue("closed");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    "macos",
  );
  await expect(rows(page)).toHaveText([CODES.closed]);
});

test("back returns to the filtered list and puts the filter in the controls again @webkit", async ({
  page,
}) => {
  await page.getByLabel("Status").selectOption("published");
  await expect(page).toHaveURL("/admin/reports?status=published");
  await rows(page).first().click();
  await expect(heading(page)).toHaveText(CODES.published);
  await expectHeadingFocused(page);

  await page.goBack();

  await expect(page).toHaveURL("/admin/reports?status=published");
  await expect(page.getByLabel("Status")).toHaveValue("published");
  await expect(rows(page)).toHaveCount(2);
  await expectHeadingFocused(page);
  await page.goForward();
  await expect(heading(page)).toHaveText(CODES.published);
  await expectHeadingFocused(page);
});

test("the reports link in the navigation clears a filter set in the address", async ({
  page,
}) => {
  await page.goto("/admin/reports?status=closed&q=macos");
  await expect(rows(page)).toHaveCount(1);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Reports" })
    .click();

  await expect(page).toHaveURL("/admin/reports");
  await expect(page.getByLabel("Status")).toHaveValue("");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  await expect(rows(page)).toHaveCount(REPORT_COUNT);
});

test("a link to a report moves focus to its heading", async ({ page }) => {
  await page.getByRole("link", { name: CODES.reviewing }).click();

  await expect(heading(page)).toHaveText(CODES.reviewing);
  await expectHeadingFocused(page);
});

test("typing quickly never throws @webkit", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search" });

  await search.pressSequentially("windows 1.3.2 published", { delay: 5 });
  await search.press("Backspace");
  await search.pressSequentially("d");

  await expect(page).toHaveURL("/admin/reports?q=windows+1.3.2+published");
  await expect(rows(page)).toHaveCount(1);
});

test("a list that fails to load can be tried again and focuses the heading", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await failOnce(page, REPORTS_API, 502, { error: "relayUnavailable" });

  await page.goto("/admin/reports");
  await expect(page.getByText("Could not load reports")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(rows(page)).toHaveCount(REPORT_COUNT);
  await expectHeadingFocused(page);
});
