import type { Page } from "@playwright/test";

import { expectHeadingFocused, heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES, PROBLEM, RECEIVED_TEXT } from "./samples.ts";
import {
  badgeOf,
  expectMoveAnnounced,
  moveButton,
  moveStatus,
  openReport,
} from "./report-page.ts";
import {
  expectMoves,
  failAlways,
  failOnce,
  MOVE_API,
  REPORT_API,
  stubSignInPage,
  succeedMoves,
} from "./stubs.ts";

const REFUSAL = "A closed report cannot be moved to reviewing.";

function recoveries(page: Page) {
  return page.locator(PROBLEM).getByRole("button");
}

test("the always-refusing relay shows the refusal and reload clears it", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openReport(page, CODES.received);
  const answer = page.waitForResponse(
    (response) => response.request().method() === "POST",
  );

  await moveButton(page, "Reviewing").click();

  const refused = await answer;
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: "refused", from: "closed" });
  await expect(page.locator(PROBLEM)).toContainText(
    "Could not move this report",
  );
  await expect(page.locator(PROBLEM)).toContainText(REFUSAL);
  await expect(page.locator(PROBLEM)).toBeFocused();
  await expect(recoveries(page)).toHaveText(["Reload report"]);
  await recoveries(page).click();
  await expect(page.locator(PROBLEM)).toHaveCount(0);
  await expect(badgeOf(page)).toContainText("Received");
  await expectHeadingFocused(page);
});

test("a refusal keeps the typed issue number", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openReport(page, CODES.received);
  await page.getByLabel("Issue number").fill("77");

  await moveButton(page, "Reviewing").click();
  await expect(page.locator(PROBLEM)).toBeVisible();

  await expect(page.getByLabel("Issue number")).toHaveValue("77");
});

test("a rejected session token asks for a reload and offers no way to try again", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openReport(page, CODES.received);
  await failAlways(page, MOVE_API, 403, { error: "csrfRejected" });

  await moveButton(page, "Closed").click();

  await expect(page.locator(PROBLEM)).toContainText(
    "Your session is out of date. Reload the page and try again.",
  );
  await expect(recoveries(page)).toHaveCount(0);
});

test("a service that does not answer can only be tried again", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  const requests = await succeedMoves(page);
  await openReport(page, CODES.received);
  await failOnce(page, MOVE_API, 502, { error: "relayUnavailable" });

  await moveButton(page, "Closed").click();
  await expect(page.locator(PROBLEM)).toContainText(
    "The reports service did not answer. Try again in a moment.",
  );
  await expect(recoveries(page)).toHaveText(["Try again"]);
  await recoveries(page).click();

  await expect(badgeOf(page)).toContainText("Closed");
  await expectMoveAnnounced(page, "Moved to Closed.");
  expectMoves(requests, [{ status: "closed" }]);
});

test("a lost answer offers reload first and then try again", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openReport(page, CODES.received);
  await page.getByLabel("Issue number").fill("5");
  await page.route(MOVE_API, (route) => route.abort("connectionreset"));

  await moveButton(page, "Closed").click();

  await expect(page.locator(PROBLEM)).toContainText(
    "The admin service could not be reached.",
  );
  await expect(recoveries(page)).toHaveText(["Reload report", "Try again"]);
  await expect(page.getByLabel("Issue number")).toHaveValue("5");
});

test("a report that disappeared says so and can only be reloaded", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openReport(page, CODES.received);
  await failAlways(page, MOVE_API, 404, { error: "notFound" });

  await moveButton(page, "Closed").click();

  await expect(page.locator(PROBLEM)).toContainText(
    "This report no longer exists.",
  );
  await expect(recoveries(page)).toHaveText(["Reload report"]);
});

test("an ended session sends the browser to sign in", async ({
  page,
  expectFailedLoads,
}) => {
  expectFailedLoads(1);
  await openReport(page, CODES.received);
  await stubSignInPage(page);
  await failAlways(page, MOVE_API, 401, { error: "signedOut" });

  await moveButton(page, "Closed").click();

  await expect(page).toHaveURL("/admin/login");
});

test.describe("a reload that fails after a lost answer", () => {
  test.beforeEach(async ({ page, expectFailedLoads }) => {
    expectFailedLoads(2);
    await openReport(page, CODES.received);
    await page.route(MOVE_API, (route) => route.abort("connectionreset"));
    await moveButton(page, "Closed").click();
    await expect(page.locator(PROBLEM)).toContainText(
      "The admin service could not be reached.",
    );
    await expect(recoveries(page)).toHaveText(["Reload report", "Try again"]);
  });

  test("leaves focus on the page heading and can be tried again", async ({
    page,
  }) => {
    await failOnce(page, REPORT_API, 502, { error: "relayUnavailable" });

    await recoveries(page).first().click();

    await expect(page.getByText("Could not load this report")).toBeVisible();
    await expect(heading(page)).toHaveText(CODES.received);
    await expectHeadingFocused(page);
    await expect(moveStatus(page)).toHaveCount(0);
    await expect(page.locator(PROBLEM)).toHaveCount(0);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("pre")).toHaveText(RECEIVED_TEXT);
    await expectHeadingFocused(page);
  });

  test("leaves focus on the page heading when the report is gone", async ({
    page,
  }) => {
    await failAlways(page, REPORT_API, 404, { error: "notFound" });

    await recoveries(page).first().click();

    await expect(page.getByText("This report does not exist")).toBeVisible();
    await expect(heading(page)).toHaveText(CODES.received);
    await expectHeadingFocused(page);
  });
});
