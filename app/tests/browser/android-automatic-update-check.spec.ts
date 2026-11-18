import type { Page } from "@playwright/test";

import type {
  CheckedForUpdates,
  UpdateStatus,
} from "../../src/lib/ipc/bindings.ts";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  leaveAndComeBack,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const OFF: UpdateStatus = {
  isAutomatic: false,
  release: { kind: "unchecked" },
};
const UP_TO_DATE: CheckedForUpdates = {
  outcome: "upToDate",
  status: { isAutomatic: true, release: { kind: "upToDate" } },
};
const OFF_LINE = "Off. When on, asks GitHub once a day and sends nothing else.";
const ON_LINE = "On. Asks GitHub once a day and sends nothing else.";
const PRIVACY_LINE = "Checks for a new version only if you turn it on.";

let status: UpdateStatus = OFF;
let dueCheck: CheckedForUpdates | null = null;
let asked: string[] = [];

const BUILD_WITH_THE_CHECK: FakeBackend = {
  ...readerBackend(DEFAULT_BACKEND),
  appInfo: () => ({ ...fakeAppInfo("android"), checksForUpdates: true }),
  updateStatus: () => status,
  updateNotices: () => ({
    isOn: false,
    canShow: true,
    access: "allowed" as const,
  }),
  rememberUpdateNoticeWords: () => null,
  checkForUpdatesIfDue: () => {
    asked.push("checkIfDue");
    if (dueCheck === null) {
      return { outcome: null, status };
    }
    status = dueCheck.status;
    return dueCheck;
  },
  setAutomaticUpdateCheck: (isOn) => {
    asked.push(`setAutomatic ${String(isOn)}`);
    status = { ...status, isAutomatic: isOn };
    return status;
  },
};

test.use({ backend: BUILD_WITH_THE_CHECK });

testOnlyInItsWebview("android");

test.beforeEach(() => {
  status = OFF;
  dueCheck = null;
  asked = [];
});

function automaticSwitch(page: Page) {
  return page
    .getByRole("main")
    .getByRole("switch", { name: "Check for updates automatically" });
}

test.describe("the automatic update check on About", () => {
  test("is off until turned on, and says what it would send", async ({
    page,
  }) => {
    await page.goto("/settings/about");

    await expect(automaticSwitch(page)).not.toBeChecked();
    await expect(automaticSwitch(page)).toHaveAccessibleDescription(OFF_LINE);
  });

  test("turns on, then asks Android whether a check is due", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    await expect(automaticSwitch(page)).toBeVisible();
    asked = [];

    await automaticSwitch(page).click();

    await expect(automaticSwitch(page)).toBeChecked();
    await expect(automaticSwitch(page)).toHaveAccessibleDescription(ON_LINE);
    expect(asked).toEqual(["setAutomatic true", "checkIfDue"]);
  });

  test("sits right under Check for updates", async ({ page }) => {
    await page.goto("/settings/about");

    const rows = page
      .getByRole("main")
      .getByRole("list")
      .filter({ hasText: "Report a problem" })
      .getByRole("listitem");

    await expect(rows.nth(0)).toContainText("Check for updates");
    await expect(rows.nth(1)).toContainText("Check for updates automatically");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/settings/about");
      await expect(automaticSwitch(page)).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("asking Android whether a check is due", () => {
  test("asks when the app starts and again on each return to it", async ({
    page,
  }) => {
    await page.goto("/");
    await expect.poll(() => asked).toEqual(["checkIfDue"]);

    await leaveAndComeBack(page);

    await expect.poll(() => asked).toEqual(["checkIfDue", "checkIfDue"]);
  });

  test("shows on About what a due check found", async ({ page }) => {
    status = { ...OFF, isAutomatic: true };
    dueCheck = UP_TO_DATE;

    await page.goto("/settings/about");

    await expect(
      page
        .getByRole("main")
        .getByRole("button", { name: /^Check for updates/ }),
    ).toHaveAccessibleName("Check for updates Up to date");
  });

  test("never asks while a book is open", async ({ page }) => {
    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();

    await leaveAndComeBack(page);

    expect(asked).toEqual([]);
  });
});

test.describe("Privacy in a build with the check", () => {
  test("says the app checks for a new version only when asked to", async ({
    page,
  }) => {
    await page.goto("/settings/privacy");

    await expect(page.getByRole("main")).toContainText(PRIVACY_LINE);
  });
});

test.describe("a build without the check", () => {
  test.use({
    backend: {
      ...BUILD_WITH_THE_CHECK,
      appInfo: () => fakeAppInfo("android"),
    },
  });

  test("never asks whether a check is due", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();

    await leaveAndComeBack(page);

    expect(asked).toEqual([]);
  });

  test("has no automatic switch and no line about checks on Privacy", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    await expect(
      page.getByRole("main").getByRole("list").first(),
    ).toBeVisible();

    await expect(automaticSwitch(page)).toHaveCount(0);
    await page.goto("/settings/privacy");
    await expect(page.getByRole("main")).not.toContainText(PRIVACY_LINE);
  });
});
