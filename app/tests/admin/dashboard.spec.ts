import type { Locator } from "@playwright/test";

import { expectHeadingFocused, heading, isPhone } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES } from "./samples.ts";
import { openSignedIn } from "./sign-in.ts";
import { failOnce, REPORTS_API } from "./stubs.ts";

const COUNTS = {
  Received: 1,
  Reviewing: 1,
  Published: 2,
  Duplicate: 1,
  Closed: 1,
} as const;
const FULL_BAR = 100;
const BAR_PRECISION = 1;

async function barShare(row: Locator): Promise<number> {
  return row.locator("svg").evaluate((svg) => {
    const bar = svg.querySelector("rect");
    return bar === null
      ? 0
      : (bar.getBoundingClientRect().width /
          svg.getBoundingClientRect().width) *
          100;
  });
}

test.beforeEach(async ({ page }) => {
  await openSignedIn(page, "/admin");
  await expect(heading(page)).toHaveText("Dashboard");
});

test("the dashboard counts every status", async ({ page }) => {
  for (const [status, count] of Object.entries(COUNTS)) {
    const card = page.getByRole("link", { name: new RegExp(`^${status}\\s`) });
    await expect(card).toContainText(String(count));
    await expect(card).toHaveAttribute(
      "href",
      `/admin/reports?status=${status.toLowerCase()}`,
    );
  }
});

test("the bars are as long as their share of the largest count", async ({
  page,
}) => {
  const platform = page.getByRole("listitem").filter({ hasText: "android" });
  const version = page.getByRole("listitem").filter({ hasText: "1.2.9" });

  expect(await barShare(platform)).toBeCloseTo(FULL_BAR, BAR_PRECISION);
  expect(await barShare(version)).toBeCloseTo(FULL_BAR / 3, BAR_PRECISION);
});

test("the waiting-longest list holds the received reports only", async ({
  page,
}) => {
  const waiting = page.getByRole("link", { name: CODES.received });

  await expect(waiting).toHaveCount(1);
  for (const code of [CODES.reviewing, CODES.published, CODES.closed]) {
    await expect(page.getByRole("link", { name: code })).toHaveCount(0);
  }
});

test("a status card opens the list for that status and focuses the heading", async ({
  page,
}) => {
  await page.getByRole("link", { name: /^Published\s/ }).click();

  await expect(page).toHaveURL("/admin/reports?status=published");
  await expect(heading(page)).toHaveText("Reports");
  await expectHeadingFocused(page);
  await expect(page.getByLabel("Status")).toHaveValue("published");
  await expect(page.getByRole("link", { name: /^R-/ })).toHaveCount(2);
});

test("view all reports opens the list of received reports", async ({
  page,
}) => {
  await page.getByRole("link", { name: "View all reports" }).click();

  await expect(page).toHaveURL("/admin/reports?status=received");
});

test("only the subtitle for the screen size is shown", async ({ page }) => {
  const phoneNote = page.getByText("Reports from the newest 500.");
  const tabletNote = page.getByText("Counts cover the newest 500 reports.");

  await expect(phoneNote).toBeVisible({ visible: isPhone(page) });
  await expect(tabletNote).toBeVisible({ visible: !isPhone(page) });
});

test("a dashboard that fails to load can be tried again and focuses the heading", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await failOnce(page, REPORTS_API, 502, { error: "relayUnavailable" });

  await page.goto("/admin");
  await expect(page.getByText("Could not load reports")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("link", { name: /^Received\s/ })).toBeVisible();
  await expectHeadingFocused(page);
});
