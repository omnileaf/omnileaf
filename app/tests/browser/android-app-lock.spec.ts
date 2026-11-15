import type { Locator, Page } from "@playwright/test";

import type { AppLock, AppLockTurning } from "../../src/lib/ipc/bindings.ts";
import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const ONLY_WHEN_ON = "Available when app lock is on.";

let lock: AppLock = NEW_APP_LOCK;
let turning: AppLockTurning = "turnedOn";
let promptTitles: string[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    appLock: () => lock,
    turnAppLockOn: (promptTitle) => {
      promptTitles.push(promptTitle);
      if (turning === "turnedOn") {
        lock = { ...lock, isOn: true };
      }
      return turning;
    },
    turnAppLockOff: () => {
      lock = { ...lock, isOn: false };
      return null;
    },
    chooseLockAfter: (lockAfter) => {
      lock = { ...lock, lockAfter };
      return null;
    },
    hideContentInRecents: (isHidden) => {
      lock = { ...lock, hidesContentInRecents: isHidden };
      return null;
    },
  },
});

async function openAppLock(page: Page): Promise<void> {
  await page.goto("/settings/privacy/app-lock");
  await expect(
    page.getByRole("heading", { level: 1, name: "App lock" }),
  ).toBeVisible();
}

function lockSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Lock Omnileaf" });
}

function lockAfter(page: Page): Locator {
  return page.getByRole("button", { name: /^Lock after/ });
}

function hideContent(page: Page): Locator {
  return page.getByRole("switch", {
    name: "Hide content in the recent apps screen",
  });
}

test.describe("App lock on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's app lock");
    lock = NEW_APP_LOCK;
    turning = "turnedOn";
    promptTitles = [];
  });

  test("leads Privacy and security with App lock, off", async ({ page }) => {
    await page.goto("/settings/privacy");

    const first = page.getByRole("link").filter({ hasText: "App lock" });

    await expect(first).toContainText("Off");
    await expect(page.getByRole("link").nth(1)).not.toContainText("App lock");
  });

  test("keeps Lock after and Hide content disabled, saying why, while the lock is off", async ({
    page,
  }) => {
    await openAppLock(page);

    await expect(lockSwitch(page)).not.toBeChecked();
    await expect(lockAfter(page)).toBeDisabled();
    await expect(hideContent(page)).toBeDisabled();
    await expect(page.getByText(ONLY_WHEN_ON)).toHaveCount(2);
  });

  test("turns the lock on once the phone confirms it, and names it on Privacy and security", async ({
    page,
  }) => {
    await openAppLock(page);

    await lockSwitch(page).click();

    await expect(lockSwitch(page)).toBeChecked();
    expect(promptTitles).toEqual(["Turn on app lock"]);
    await expect(lockAfter(page)).toBeEnabled();
    await expect(page.getByText(ONLY_WHEN_ON)).toHaveCount(0);
    await page.goto("/settings/privacy");
    await expect(
      page.getByRole("link").filter({ hasText: "App lock" }),
    ).toContainText("Fingerprint, face or screen lock · after 1 minute");
  });

  test("leaves the lock off when the check is cancelled", async ({ page }) => {
    turning = "notConfirmed";
    await openAppLock(page);

    await lockSwitch(page).click();

    await expect(lockSwitch(page)).not.toBeChecked();
    await expect(
      page.getByText("Set a screen lock on this phone first"),
    ).toHaveCount(0);
  });

  test("asks for a screen lock first on a phone without one", async ({
    page,
  }) => {
    turning = "noScreenLock";
    await openAppLock(page);

    await lockSwitch(page).click();

    await expect(lockSwitch(page)).not.toBeChecked();
    await expect(
      page.getByText("Set a screen lock on this phone first"),
    ).toBeVisible();
  });

  test("locks after the delay chosen", async ({ page }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await lockAfter(page).click();
    await page.getByRole("radio", { name: "15 minutes" }).click();

    await expect(lockAfter(page)).toContainText("15 minutes");
    expect(lock.lockAfter).toBe("fifteenMinutes");
  });

  test("hides content in the recent apps screen once chosen", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await hideContent(page).click();

    await expect(hideContent(page)).toBeChecked();
    expect(lock.hidesContentInRecents).toBe(true);
  });

  test("leaves out Hide content where Android can't hide only the recents card", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, canHideContentInRecents: false };
    await openAppLock(page);

    await expect(hideContent(page)).toHaveCount(0);
  });

  test("turns the lock off without asking", async ({ page }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await lockSwitch(page).click();

    await expect(lockSwitch(page)).not.toBeChecked();
    expect(promptTitles).toEqual([]);
  });
});

test.describe("Privacy and security elsewhere", () => {
  test("leaves App lock out", async ({ page, platform }) => {
    test.skip(platform === "android", "only Android has an app lock");
    await page.goto("/settings/privacy");

    await expect(page.getByText("Permissions").first()).toBeVisible();
    await expect(page.getByText("App lock")).toHaveCount(0);
  });
});
