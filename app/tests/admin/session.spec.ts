import type { Page } from "@playwright/test";

import { countRequests, expectHeadingFocused, heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { openSignedIn } from "./sign-in.ts";
import {
  failAlways,
  failOnce,
  gate,
  LOGOUT_API,
  SESSION_API,
  stubSignInPage,
} from "./stubs.ts";

const SESSION_OUT_OF_DATE =
  "Your session is out of date. Reload the page and try again.";

async function failSignOut(page: Page, until?: Promise<undefined>) {
  await page.route(LOGOUT_API, async (route) => {
    await until;
    await route.fulfill({ status: 403, json: { error: "csrfRejected" } });
  });
}

test("a visitor with no session ends on the dashboard after signing in", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(heading(page)).toHaveText("Dashboard");
  const session = await page.request.get("/admin/api/session");
  expect(session.status()).toBe(200);
});

test.describe("when the session cannot be had", () => {
  test("a failed session shows the problem, and trying again loads the reports once", async ({
    page,
    expectFailedLoads,
  }) => {
    expectFailedLoads(1);
    await openSignedIn(page, "/admin");
    await failOnce(page, SESSION_API, 502, { error: "relayUnavailable" });
    const listed = countRequests(
      page,
      ({ pathname }) => pathname === "/admin/api/reports",
    );

    await page.goto("/admin");

    await expect(heading(page)).toHaveText("Could not open your session");
    await expect(page.getByRole("alert")).toContainText(
      "The reports service did not answer.",
    );
    expect(listed()).toBe(0);
    await page.getByRole("button", { name: "Try again" }).click();

    await expect(heading(page)).toHaveText("Dashboard");
    await expectHeadingFocused(page);
    await expect(page.getByRole("link", { name: /^Received\s/ })).toBeVisible();
    expect(listed()).toBe(1);
  });

  test("an ended session sends the browser to sign in", async ({
    page,
    expectFailedLoads,
  }) => {
    expectFailedLoads(1);
    await openSignedIn(page, "/admin");
    await stubSignInPage(page);
    await failAlways(page, SESSION_API, 401, { error: "signedOut" });

    await page.goto("/admin", { waitUntil: "commit" });

    await expect(page).toHaveURL("/admin/login");
  });
});

test("the skip link is the first stop and moves focus to the content", async ({
  page,
}) => {
  await openSignedIn(page, "/admin");
  await expect(heading(page)).toHaveText("Dashboard");

  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to the content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("signing out ends the session and goes to sign in", async ({ page }) => {
  await openSignedIn(page, "/admin");
  await stubSignInPage(page);
  const loggedOut = page.waitForResponse((response) =>
    response.url().endsWith("/admin/api/logout"),
  );

  await page.getByRole("button", { name: "Sign out" }).click();

  expect((await loggedOut).status()).toBe(204);
  await expect(page).toHaveURL("/admin/login");
  const session = await page.request.get("/admin/api/session");
  expect(session.status()).toBe(401);
});

test.describe("when signing out fails", () => {
  test.beforeEach(async ({ page, expectFailedLoads }) => {
    expectFailedLoads(1);
    await openSignedIn(page, "/admin");
  });

  test("the alert shows and the button works again", async ({ page }) => {
    await failSignOut(page);
    const signOut = page.getByRole("button", { name: "Sign out" });

    await signOut.click();

    await expect(page.getByText("Could not sign out")).toBeVisible();
    await expect(page.getByText(SESSION_OUT_OF_DATE)).toBeVisible();
    await expect(signOut).toBeEnabled();
  });

  test("a double click sends one request", async ({ page }) => {
    const logouts = countRequests(
      page,
      ({ pathname }, method) =>
        pathname === "/admin/api/logout" && method === "POST",
    );
    const answer = gate();
    await failSignOut(page, answer.passed);

    await page.getByRole("button", { name: "Sign out" }).dblclick();
    answer.open();

    await expect(page.getByText("Could not sign out")).toBeVisible();
    expect(logouts()).toBe(1);
  });

  test("moving on clears the alert and focuses the heading", async ({
    page,
  }) => {
    await failSignOut(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Could not sign out")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Reports" })
      .click();

    await expect(page.getByText("Could not sign out")).toHaveCount(0);
    await expectHeadingFocused(page);
  });
});
