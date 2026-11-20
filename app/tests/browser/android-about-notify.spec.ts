import type { Page } from "@playwright/test";

import type {
  UpdateNoticeTurning,
  UpdateNoticeWords,
  UpdateStatus,
} from "../../src/lib/ipc/bindings.ts";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const HINT =
  "A notification when a new version is out, even if the app is closed. Android asks to allow notifications first.";
const BLOCKED =
  "Notifications are off for Omnileaf in Android settings. Turn them on there to get update notifications.";

let status: UpdateStatus = {
  isAutomatic: true,
  release: { kind: "unchecked" },
};
let turning: UpdateNoticeTurning = "turnedOn";
let isOn = false;
let asked: string[] = [];
let handedWords: UpdateNoticeWords[] = [];

const BUILD_WITH_THE_CHECK: FakeBackend = {
  ...DEFAULT_BACKEND,
  appInfo: () => ({ ...fakeAppInfo("android"), checksForUpdates: true }),
  updateStatus: () => status,
  checkForUpdatesIfDue: () => ({ outcome: null, status }),
  setAutomaticUpdateCheck: (isAutomatic) => {
    status = { ...status, isAutomatic };
    return status;
  },
  updateNotices: () => ({ isOn, canShow: true }),
  rememberUpdateNoticeWords: (words) => {
    handedWords.push(words);
    return null;
  },
  turnUpdateNoticesOn: () => {
    asked.push("turn on");
    isOn = turning === "turnedOn";
    return turning;
  },
  turnUpdateNoticesOff: () => {
    asked.push("turn off");
    isOn = false;
    return null;
  },
  openSystemSettings: () => {
    asked.push("open settings");
    return null;
  },
};

test.use({ backend: BUILD_WITH_THE_CHECK });

testOnlyInItsWebview("android");

test.beforeEach(() => {
  status = { isAutomatic: true, release: { kind: "unchecked" } };
  turning = "turnedOn";
  isOn = false;
  asked = [];
  handedWords = [];
});

function notifySwitch(page: Page) {
  return page
    .getByRole("main")
    .getByRole("switch", { name: "Notify me about updates" });
}

test("sits under the automatic check, off, saying Android asks first", async ({
  page,
}) => {
  await page.goto("/settings/about");

  const rows = page
    .getByRole("main")
    .getByRole("list")
    .filter({ hasText: "Report a problem" })
    .getByRole("listitem");
  await expect(rows.nth(2)).toContainText("Notify me about updates");
  await expect(notifySwitch(page)).not.toBeChecked();
  await expect(notifySwitch(page)).toHaveAccessibleDescription(HINT);
});

test("works only while the automatic check is on", async ({ page }) => {
  status = { ...status, isAutomatic: false };

  await page.goto("/settings/about");

  await expect(notifySwitch(page)).toBeDisabled();
});

test("hands Android the notice's words, then asks to turn notices on", async ({
  page,
}) => {
  await page.goto("/settings/about");
  await expect(notifySwitch(page)).toBeEnabled();
  handedWords = [];

  await notifySwitch(page).click();

  await expect(notifySwitch(page)).toBeChecked();
  expect(asked).toEqual(["turn on"]);
  expect(handedWords).toEqual([
    {
      channel: "Updates",
      title: "Omnileaf {version} is available",
      viewRelease: "View release",
      skip: "Skip this version",
    },
  ]);
});

test("stays off after a no", async ({ page }) => {
  turning = "refused";
  await page.goto("/settings/about");

  await notifySwitch(page).click();

  await expect.poll(() => asked).toEqual(["turn on"]);
  await expect(notifySwitch(page)).not.toBeChecked();
  await expect(notifySwitch(page)).toHaveAccessibleDescription(HINT);
});

test("stays off and offers Android's settings once Android won't ask", async ({
  page,
}) => {
  turning = "blocked";
  await page.goto("/settings/about");

  await notifySwitch(page).click();
  await expect(notifySwitch(page)).toHaveAccessibleDescription(BLOCKED);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Open Android settings" })
    .click();

  await expect(notifySwitch(page)).not.toBeChecked();
  await expect.poll(() => asked).toEqual(["turn on", "open settings"]);
});

test("turns notices off", async ({ page }) => {
  isOn = true;
  await page.goto("/settings/about");
  await expect(notifySwitch(page)).toBeChecked();

  await notifySwitch(page).click();

  await expect(notifySwitch(page)).not.toBeChecked();
  expect(asked).toEqual(["turn off"]);
});

test("keeps Android's notice words in the app's language from the start", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();

  await expect.poll(() => handedWords.length).toBe(1);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    turning = "blocked";
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings/about");
    await notifySwitch(page).click();
    await expect(notifySwitch(page)).toHaveAccessibleDescription(BLOCKED);

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}
