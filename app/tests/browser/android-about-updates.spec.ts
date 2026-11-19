import type { Page } from "@playwright/test";

import type {
  CheckedForUpdates,
  UpdateStatus,
} from "../../src/lib/ipc/bindings.ts";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const UNCHECKED: UpdateStatus = {
  isAutomatic: false,
  release: { kind: "unchecked" },
};
const UP_TO_DATE: UpdateStatus = {
  isAutomatic: false,
  release: { kind: "upToDate" },
};
const NEWER: UpdateStatus = {
  isAutomatic: false,
  release: {
    kind: "newer",
    version: "0.2.0",
    headline: "Series pages show Volumes, Chapters and Specials as tabs",
    releasePage: "https://github.com/omnileaf/omnileaf/releases/tag/v0.2.0",
    notice: "shown",
  },
};
const TABLET = { width: 820, height: 1180 };

let status: UpdateStatus = UNCHECKED;
let checksAsked = 0;
let answerCheck: (checked: CheckedForUpdates) => void = () => undefined;

const BUILD_WITH_THE_CHECK = {
  ...DEFAULT_BACKEND,
  appInfo: () => ({ ...fakeAppInfo("android"), checksForUpdates: true }),
  updateStatus: () => status,
  checkForUpdatesIfDue: () => ({ outcome: null, status }),
  checkForUpdates: () => {
    checksAsked += 1;
    return new Promise<CheckedForUpdates>((answer) => {
      answerCheck = answer;
    });
  },
};

test.use({ backend: BUILD_WITH_THE_CHECK });

testOnlyInItsWebview("android");

test.beforeEach(() => {
  status = UNCHECKED;
  checksAsked = 0;
});

function firstAboutRow(page: Page) {
  return page
    .getByRole("main")
    .getByRole("list")
    .filter({ hasText: "Report a problem" })
    .getByRole("listitem")
    .first();
}

function checkRow(page: Page) {
  return page
    .getByRole("main")
    .getByRole("button", { name: /^Check for updates/ });
}

test.describe("Check for updates on About in an Android build with the check", () => {
  test("puts the row first, with no second line before the first check", async ({
    page,
  }) => {
    await page.goto("/settings/about");

    await expect(checkRow(page)).toHaveAccessibleName("Check for updates");
    await expect(firstAboutRow(page)).toContainText("Check for updates");
  });

  test("says the app is up to date after the last check", async ({ page }) => {
    status = UP_TO_DATE;

    await page.goto("/settings/about");

    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Up to date",
    );
  });

  test("announces nothing on opening About, leaving the line to the row", async ({
    page,
  }) => {
    status = UP_TO_DATE;

    await page.goto("/settings/about");

    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Up to date",
    );
    await expect(firstAboutRow(page).getByRole("status")).toHaveText("");
  });

  test("names the newer version the last check found", async ({ page }) => {
    status = NEWER;

    await page.goto("/settings/about");

    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Omnileaf 0.2.0 is available",
    );
  });

  test("checks once for a tap, saying so until the check answers", async ({
    page,
  }) => {
    await page.goto("/settings/about");

    await checkRow(page).click();
    await checkRow(page).click();
    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Checking…",
    );
    answerCheck({ outcome: "available", status: NEWER });

    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Omnileaf 0.2.0 is available",
    );
    await expect(firstAboutRow(page).getByRole("status")).toHaveText(
      "Omnileaf 0.2.0 is available",
    );
    expect(checksAsked).toBe(1);
  });

  test("asks to try again when the check could not reach GitHub", async ({
    page,
  }) => {
    await page.goto("/settings/about");

    await checkRow(page).click();
    answerCheck({ outcome: "offline", status: UNCHECKED });

    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Couldn't check. Try again.",
    );
  });

  test("shows the row on a tablet too", async ({ page }) => {
    await page.setViewportSize(TABLET);
    status = UP_TO_DATE;

    await page.goto("/settings/about");

    await expect(checkRow(page)).toHaveAccessibleName(
      "Check for updates Up to date",
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      status = NEWER;
      await page.emulateMedia({ colorScheme });
      await page.goto("/settings/about");
      await expect(checkRow(page)).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("About in a build without the check", () => {
  test.use({
    backend: { ...DEFAULT_BACKEND, appInfo: () => fakeAppInfo("android") },
  });

  test("has no update rows", async ({ page }) => {
    await page.goto("/settings/about");
    await expect(
      page.getByRole("main").getByRole("list").first(),
    ).toBeVisible();

    await expect(checkRow(page)).toHaveCount(0);
  });
});

test.describe("About away from Android", () => {
  test.use({
    backend: {
      ...BUILD_WITH_THE_CHECK,
      appInfo: () => ({ ...fakeAppInfo("linux"), checksForUpdates: true }),
    },
  });

  test("has no update rows", async ({ page }) => {
    await page.goto("/settings/about");
    await expect(
      page.getByRole("main").getByRole("list").first(),
    ).toBeVisible();

    await expect(checkRow(page)).toHaveCount(0);
  });
});
