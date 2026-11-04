import { countRequests, expectHeadingFocused, heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import {
  CODES,
  HOSTILE_TEXT,
  MALFORMED_CODE,
  RECEIVED_TEXT,
  UNKNOWN_CODE,
} from "./samples.ts";
import { badgeOf, moveButton, openReport } from "./report-page.ts";
import { openSignedIn } from "./sign-in.ts";
import {
  failOnce,
  gate,
  holdAnswers,
  REPORT_API,
  showReportText,
} from "./stubs.ts";

interface Situation {
  readonly code: string;
  readonly status: string;
  readonly moves: readonly string[];
}

const ALL_MOVES = ["Reviewing", "Published", "Duplicate", "Closed"];
const OPEN: readonly Situation[] = [
  { code: CODES.received, status: "Received", moves: ALL_MOVES },
  {
    code: CODES.reviewing,
    status: "Reviewing",
    moves: ["Published", "Duplicate", "Closed"],
  },
  { code: CODES.closed, status: "Closed", moves: ["Reviewing"] },
];
const FINAL: readonly Situation[] = [
  { code: CODES.published, status: "Published", moves: [] },
  { code: CODES.otherPublished, status: "Published", moves: [] },
  { code: CODES.duplicate, status: "Duplicate", moves: [] },
];

test.describe("a report in each status", () => {
  for (const situation of OPEN) {
    test(`${situation.code} is ${situation.status} and offers ${situation.moves.join(", ")}`, async ({
      page,
    }) => {
      await openReport(page, situation.code);

      await expect(badgeOf(page)).toContainText(situation.status);
      for (const name of ALL_MOVES) {
        await expect(moveButton(page, name)).toBeEnabled({
          enabled: situation.moves.includes(name),
        });
      }
      await expect(page.getByText("This report is final")).toBeHidden();
    });
  }

  for (const situation of FINAL) {
    test(`${situation.code} is ${situation.status} and final`, async ({
      page,
    }) => {
      await openReport(page, situation.code);

      await expect(badgeOf(page)).toContainText(situation.status);
      await expect(page.getByText("This report is final")).toBeVisible();
      for (const name of ALL_MOVES) {
        await expect(moveButton(page, name)).toHaveCount(0);
      }
    });
  }

  test("the text is shown exactly as sent, or as purged", async ({ page }) => {
    await openReport(page, CODES.received);
    await expect(page.locator("pre")).toHaveText(RECEIVED_TEXT);

    await openReport(page, CODES.closed);
    await expect(
      page.getByText("The text of this report has been purged."),
    ).toBeVisible();
    await expect(page.locator("pre")).toHaveCount(0);
  });

  test("text that looks like markup is shown as text and runs nothing", async ({
    page,
  }) => {
    await openSignedIn(page, "/admin");
    await showReportText(page);

    await page.goto(`/admin/reports/${CODES.received}`);
    await expect(page.locator("pre")).toHaveText(HOSTILE_TEXT);
    await page.getByRole("link", { name: "Copy as public issue" }).click();

    await expect(page.getByLabel("Public issue text")).toHaveValue(
      HOSTILE_TEXT,
    );
    await page.goBack();
    await expect(page.locator("pre")).toHaveText(HOSTILE_TEXT);
    await expect(page.locator("pre").locator("b, img")).toHaveCount(0);
    await expect(page.locator("img[src='x']")).toHaveCount(0);
  });

  test("the audit trail lists the changes newest first", async ({ page }) => {
    await openReport(page, CODES.published);

    const card = page
      .getByText("Status changes, newest first.")
      .locator("xpath=../..");
    await expect(card).toContainText("Reviewing to Published, issue #412");
    await expect(card).toContainText("Received to Reviewing");
    const text = await card.innerText();
    expect(text.indexOf("second-reviewer")).toBeGreaterThan(
      text.indexOf("reviewer"),
    );
    expect(text.indexOf("Received to Reviewing")).toBeGreaterThan(
      text.indexOf("Reviewing to Published"),
    );
  });

  test("a report with no changes says so", async ({ page }) => {
    await openReport(page, CODES.received);

    await expect(page.getByText("No status changes yet.")).toBeVisible();
  });

  test("the old audit address opens the report", async ({ page }) => {
    await openSignedIn(page, `/admin/reports/${CODES.published}/audit`);

    await expect(page).toHaveURL(`/admin/reports/${CODES.published}`);
    await expect(heading(page)).toHaveText(CODES.published);
  });
});

test.describe("loading and failing to load", () => {
  test("the report shows a loading state until it arrives", async ({
    page,
  }) => {
    await openSignedIn(page, "/admin");
    const answer = gate();
    await holdAnswers(page, REPORT_API, answer.passed);

    await page.goto(`/admin/reports/${CODES.received}`);

    await expect(page.getByText("Loading report")).toBeAttached();
    await expect(page.locator("[aria-busy=true]")).toBeVisible();
    answer.open();
    await expect(page.locator("pre")).toBeVisible();
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  });

  test("a report nobody sent is not found", async ({
    page,
    expectFailedLoads,
  }) => {
    expectFailedLoads(1);

    await openSignedIn(page, `/admin/reports/${UNKNOWN_CODE}`);

    await expect(page.getByText("This report does not exist")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View all reports" }),
    ).toHaveAttribute("href", "/admin/reports");
  });

  test("a code that cannot be a report is not found without asking the server", async ({
    page,
  }) => {
    await openSignedIn(page, "/admin");
    const asked = countRequests(
      page,
      ({ pathname }, method) =>
        pathname.startsWith("/admin/api/reports/") && method === "GET",
    );

    await page.goto(`/admin/reports/${MALFORMED_CODE}`);

    await expect(page.getByText("This report does not exist")).toBeVisible();
    expect(asked()).toBe(0);
  });

  test("a report that fails to load can be tried again and gets focus on its heading", async ({
    page,
    expectFailedLoads,
  }) => {
    expectFailedLoads(1);
    await openSignedIn(page, "/admin");
    await failOnce(page, REPORT_API, 502, { error: "relayUnavailable" });
    await page.goto(`/admin/reports/${CODES.received}`);

    await expect(page.getByText("Could not load this report")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.locator("pre")).toHaveText(RECEIVED_TEXT);
    await expectHeadingFocused(page);
  });
});
