import { heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES } from "./samples.ts";
import {
  badgeOf,
  expectMoveAnnounced,
  moveButton,
  openReport,
  reportRow,
} from "./report-page.ts";
import {
  expectMoves,
  failOnce,
  gate,
  holdAnswers,
  MOVE_API,
  REPORT_API,
  succeedMoves,
} from "./stubs.ts";

const ISSUE_NEEDED = "Use a whole number above zero.";
const MOVE_TARGETS = ["Reviewing", "Published", "Duplicate", "Closed"];

test("closed and reviewing swap straight away", async ({ page }) => {
  const requests = await succeedMoves(page);
  await openReport(page, CODES.closed);

  await moveButton(page, "Reviewing").click();

  await expect(badgeOf(page)).toContainText("Reviewing");
  await expectMoveAnnounced(page, "Moved to Reviewing.");
  await moveButton(page, "Closed").click();
  await expect(badgeOf(page)).toContainText("Closed");
  await expectMoveAnnounced(page, "Moved to Closed.");
  expectMoves(requests, [{ status: "reviewing" }, { status: "closed" }]);
});

test("published and duplicate need an issue number", async ({ page }) => {
  const requests = await succeedMoves(page);
  await openReport(page, CODES.received);

  for (const target of ["Published", "Duplicate"]) {
    for (const text of ["", "abc", "0", "-3"]) {
      await page.getByLabel("Issue number").fill(text);
      await moveButton(page, target).click();
      await expect(
        page.getByText(
          `Enter the issue number to mark this report ${target.toLowerCase()}. ${ISSUE_NEEDED}`,
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Issue number")).toBeFocused();
    }
  }
  expectMoves(requests, []);
});

test("cancelling a confirmation keeps the typed issue number", async ({
  page,
}) => {
  const requests = await succeedMoves(page);
  await openReport(page, CODES.received);
  await page.getByLabel("Issue number").fill("77");

  await moveButton(page, "Published").click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByLabel("Issue number")).toHaveValue("77");
  await expect(moveButton(page, "Published")).toBeFocused();
  expectMoves(requests, []);
});

test("published asks to confirm, and confirming sends once and announces the move", async ({
  page,
}) => {
  const requests = await succeedMoves(page);
  await openReport(page, CODES.received);
  await page.getByLabel("Issue number").fill("77");

  await moveButton(page, "Published").click();
  await expect(
    page.getByText(`Mark ${CODES.received} as Published, issue #77?`),
  ).toBeFocused();
  await expect(
    page.getByText("This cannot be changed afterwards."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark as Published" }).dblclick();

  await expect(page.getByText("This report is final")).toBeVisible();
  await expect(badgeOf(page)).toContainText("Published");
  await expectMoveAnnounced(page, "Moved to Published, issue #77.");
  expectMoves(requests, [{ status: "published", issue: 77 }]);
});

test("the list and the dashboard show the new status without a reload", async ({
  page,
}) => {
  await succeedMoves(page);
  await openReport(page, CODES.received);
  await page.getByLabel("Issue number").fill("5");
  await moveButton(page, "Duplicate").click();
  await page.getByRole("button", { name: "Mark as Duplicate" }).click();
  await expect(page.getByText("This report is final")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "Reports" }).click();
  await expect(reportRow(page, CODES.received)).toContainText("Duplicate");
  await nav.getByRole("link", { name: "Dashboard" }).click();

  await expect(page.getByRole("link", { name: /^Duplicate\s/ })).toContainText(
    "2",
  );
  await expect(page.getByRole("link", { name: /^Received\s/ })).toContainText(
    "0",
  );
});

test("focus stays in the card while a move is pending", async ({ page }) => {
  await succeedMoves(page);
  await openReport(page, CODES.received);
  const answer = gate();
  await holdAnswers(page, MOVE_API, answer.passed);

  await moveButton(page, "Closed").click();

  await expectMoveAnnounced(page, "Moving this report.");
  for (const name of MOVE_TARGETS) {
    await expect(moveButton(page, name)).toBeDisabled();
  }
  answer.open();
  await expectMoveAnnounced(page, "Moved to Closed.");
});

test("a move whose refresh fails still shows the move", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await succeedMoves(page);
  await openReport(page, CODES.reviewing);
  await failOnce(page, REPORT_API, 502, { error: "relayUnavailable" });

  await moveButton(page, "Closed").click();

  await expect(badgeOf(page)).toContainText("Closed");
  await expectMoveAnnounced(page, "Moved to Closed.");
  await expect(page.getByText("Could not load this report")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Reports" })
    .click();
  await expect(reportRow(page, CODES.reviewing)).toContainText("Closed");
});

test("moving on while a move is in flight keeps the list right", async ({
  page,
}) => {
  await succeedMoves(page);
  await openReport(page, CODES.received);
  const answer = gate();
  await holdAnswers(page, MOVE_API, answer.passed);
  const nav = page.getByRole("navigation", { name: "Main" });

  await moveButton(page, "Closed").click();
  await nav.getByRole("link", { name: "Reports" }).click();
  await page.getByRole("link", { name: CODES.reviewing }).click();
  await expect(heading(page)).toHaveText(CODES.reviewing);
  answer.open();
  await nav.getByRole("link", { name: "Reports" }).click();

  await expect(reportRow(page, CODES.received)).toContainText("Closed");
  await expect(reportRow(page, CODES.reviewing)).toContainText("Reviewing");
});
