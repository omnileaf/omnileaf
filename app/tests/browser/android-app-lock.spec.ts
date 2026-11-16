import type { Locator, Page } from "@playwright/test";

import type {
  AppLock,
  AppLockTurning,
  IpcErrorCode,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import { CommandFailure } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const TABLET = { width: 820, height: 1180 };
const DIMMED = "0.38";
const DISABLED_TRACKS = [
  [
    false,
    {
      fill: "oklab(0.911795 -0.0136874 0.00846565 / 0.1)",
      border: "oklab(0.578859 -0.0148621 0.00807488 / 0.1)",
    },
  ],
  [
    true,
    {
      fill: "oklab(0.318045 -0.0153013 0.00817601 / 0.1)",
      border: "rgba(0, 0, 0, 0)",
    },
  ],
] as const;
const NOTE_GAP_PX = 16;

const ONLY_WHEN_ON = "Available when app lock is on.";

const NOT_CHANGED = "Couldn't change the app lock. Try again.";

let lock: AppLock = NEW_APP_LOCK;
let turning: AppLockTurning = "turnedOn";
let promptTitles: string[] = [];
let changes: string[] = [];
let failingCode: IpcErrorCode | null = null;

function failIfAsked(): void {
  if (failingCode !== null) {
    throw new CommandFailure({ code: failingCode, message: "not changed" });
  }
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    appLock: () => {
      failIfAsked();
      return lock;
    },
    turnAppLockOn: (promptTitle) => {
      promptTitles.push(promptTitle);
      if (turning === "turnedOn") {
        lock = { ...lock, isOn: true };
      }
      return turning;
    },
    turnAppLockOff: () => {
      failIfAsked();
      lock = { ...lock, isOn: false };
      return null;
    },
    chooseLockAfter: (lockAfter) => {
      changes.push(`lockAfter ${lockAfter}`);
      failIfAsked();
      lock = { ...lock, lockAfter };
      return null;
    },
    hideContentInRecents: (isHidden) => {
      changes.push(`hide ${String(isHidden)}`);
      failIfAsked();
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

function firstEntry(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("list")
    .first()
    .getByRole("link")
    .first();
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
    changes = [];
    failingCode = null;
  });

  test("leads Privacy and security with App lock, off", async ({ page }) => {
    await page.goto("/settings/privacy");

    const first = firstEntry(page);

    await expect(first).toContainText("App lock");
    await expect(first).toContainText("Off");
  });

  test("keeps App lock in Privacy and security when it can't be read, so the lock can still be turned off", async ({
    page,
  }) => {
    failingCode = "internal";
    await page.goto("/settings/privacy");

    await expect(firstEntry(page)).toContainText("App lock");
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

  test("dims Lock after and Hide content while the lock is off, and ignores taps on them", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, hidesContentInRecents: true };
    await openAppLock(page);
    const words = [
      page.getByText("Lock after", { exact: true }).locator(".."),
      page
        .getByText("Hide content in the recent apps screen", { exact: true })
        .locator(".."),
    ];

    for (const row of words) {
      await expect(row).toHaveCSS("opacity", DIMMED);
    }
    for (const row of [lockAfter(page), hideContent(page)]) {
      const resting = await row.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await row.hover({ force: true });
      await expect(row).toHaveCSS("background-color", resting);
      await row.click({ force: true });
    }
    await lockSwitch(page).click();
    await expect(lockSwitch(page)).toBeChecked();

    expect(changes).toEqual([]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("draws a disabled switch in the disabled colours, on and off", async ({
    page,
  }) => {
    for (const [isHidden, colours] of DISABLED_TRACKS) {
      lock = { ...NEW_APP_LOCK, hidesContentInRecents: isHidden };
      await openAppLock(page);

      const track = hideContent(page)
        .locator("span[aria-hidden='true']")
        .last();

      await expect(hideContent(page)).toBeChecked({ checked: isHidden });
      await expect(track).toHaveCSS("background-color", colours.fill);
      await expect(track).toHaveCSS("border-top-color", colours.border);
    }
  });

  test("puts the delay's note under Lock after, apart from the rows around it", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    const delay = await boxOf(lockAfter(page));
    const noteText = page.getByText(/^Counts from when you leave Omnileaf/);
    const note = await boxOf(noteText);
    const hide = await boxOf(hideContent(page));

    await expect(lockAfter(page)).not.toContainText("Counts from");
    expect(note.y).toBeGreaterThanOrEqual(delay.y + delay.height);
    expect(hide.y).toBeGreaterThanOrEqual(note.y + note.height);
    await expect(noteText).toHaveCSS(
      "padding-bottom",
      `${String(NOTE_GAP_PX)}px`,
    );
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
    await expect.poll(() => promptTitles).toEqual(["Turn on app lock"]);
    await expect(lockSwitch(page)).toBeEnabled();

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

  test("keeps the lock on and says so when it can't be turned off", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);
    failingCode = "internal";

    await lockSwitch(page).click();

    await expect(page.getByText(NOT_CHANGED)).toBeVisible();
    await expect(lockSwitch(page)).toBeChecked();
  });

  test("keeps the old delay and says so when a new one can't be kept", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);
    failingCode = "internal";

    await lockAfter(page).click();
    await page.getByRole("radio", { name: "15 minutes" }).click();

    await expect(page.getByText(NOT_CHANGED)).toBeVisible();
    await expect(lockAfter(page)).toContainText("1 minute");
  });

  test("keeps content shown and says so when hiding it can't be kept", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);
    failingCode = "internal";

    await hideContent(page).click();

    await expect(page.getByText(NOT_CHANGED)).toBeVisible();
    await expect(hideContent(page)).not.toBeChecked();
  });

  test("says the App lock page couldn't be opened when the lock can't be read", async ({
    page,
  }) => {
    failingCode = "internal";

    await page.goto("/settings/privacy/app-lock");

    await expect(page.getByText("This page couldn't be opened")).toBeVisible();
    await expect(lockSwitch(page)).toHaveCount(0);
  });

  test("hides App lock while Android doesn't offer it", async ({ page }) => {
    failingCode = "appLockUnavailable";
    await page.goto("/settings/privacy");
    await expect(page.getByText("Screenshot mode")).toBeVisible();

    await expect(page.getByText("App lock")).toHaveCount(0);
    await page.goto("/settings/privacy/app-lock");
    await expect(page.getByText("This page doesn't exist")).toBeVisible();
  });

  test("turns the lock off without asking", async ({ page }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await lockSwitch(page).click();

    await expect(lockSwitch(page)).not.toBeChecked();
    expect(promptTitles).toEqual([]);
  });
});

test.describe("App lock on an Android tablet", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's app lock");
    lock = { ...NEW_APP_LOCK, isOn: true };
    failingCode = null;
  });

  test("lines up both switches in one card, with Lock after in its own", async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await openAppLock(page);

    const lockToggle = await boxOf(lockSwitch(page));
    const hideToggle = await boxOf(hideContent(page));
    const delay = await boxOf(lockAfter(page));
    const card = page.locator("section").filter({ has: lockSwitch(page) });

    await expect(card.filter({ has: hideContent(page) })).toHaveCount(1);
    expect(hideToggle.y).toBeGreaterThan(lockToggle.y + lockToggle.height);
    expect(hideToggle.x + hideToggle.width).toBeCloseTo(
      lockToggle.x + lockToggle.width,
      0,
    );
    expect(delay.y).toBeGreaterThan(hideToggle.y + hideToggle.height);
  });
});

test.describe("Privacy and security elsewhere", () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform === "android", "only Android has an app lock");
    failingCode = "appLockUnavailable";
  });

  test("leaves App lock out", async ({ page }) => {
    await page.goto("/settings/privacy");

    await expect(page.getByText("Permissions").first()).toBeVisible();
    await expect(page.getByText("App lock")).toHaveCount(0);
  });

  test("has no App lock page", async ({ page }) => {
    await page.goto("/settings/privacy/app-lock");

    await expect(page.getByText("This page doesn't exist")).toBeVisible();
  });
});
