import type { Locator, Page } from "@playwright/test";

import type {
  AppLock,
  AppLockTurning,
  IpcErrorCode,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

const TABLET = { width: 820, height: 1180 };
const PAGE_GUTTER_PX = 16;
const CARD_RADIUS = "28px";
const CARD_ROW_PX = 56;
const TIMES_GAP_PX = 12;
const LIGHT_SURFACE_FIELD = "rgb(219, 229, 220)";
const DARK_SURFACE_FIELD = "rgb(31, 39, 33)";
const NOTE = /^Asks for your fingerprint, face or screen lock/;
const ONLY_WHEN_ON = "Available when app lock is on.";

const NOT_CHANGED = "Couldn't change the app lock. Try again.";

const TIMES = [
  "Immediately",
  "After 1 minute",
  "After 5 minutes",
  "After 30 minutes",
];

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

function note(page: Page): Locator {
  return page.getByText(NOTE);
}

function switchCard(page: Page): Locator {
  return page.locator("section").filter({ has: lockSwitch(page) });
}

function startAppLock(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Start app lock" });
}

function timesCard(page: Page): Locator {
  return page.locator("section").filter({ has: startAppLock(page) });
}

async function cardLookOf(card: Locator): Promise<readonly string[]> {
  return card.evaluate((element) => {
    const { backgroundColor, borderRadius, borderWidth } =
      getComputedStyle(element);
    return [backgroundColor, borderRadius, borderWidth];
  });
}

function time(page: Page, name: string): Locator {
  return startAppLock(page).getByRole("radio", { name, exact: true });
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

  test("opens with a note saying downloads and sync carry on while it's locked", async ({
    page,
  }) => {
    await openAppLock(page);

    const words = await boxOf(note(page));
    const art = await boxOf(note(page).locator("..").locator("svg"));
    const toggle = await boxOf(lockSwitch(page));
    const width = page.viewportSize()?.width ?? 0;

    await expect(note(page)).toContainText("Downloads and sync carry on");
    expect(words.y + words.height).toBeLessThanOrEqual(toggle.y);
    expect(art.y + art.height).toBeLessThanOrEqual(words.y);
    expect(art.x + art.width / 2).toBeCloseTo(width / 2, 0);
  });

  test("puts Lock Omnileaf alone in a rounded card 16px in from each edge", async ({
    page,
  }) => {
    await openAppLock(page);

    const card = await boxOf(switchCard(page));
    const row = await boxOf(lockSwitch(page));
    const width = page.viewportSize()?.width ?? 0;

    await expect(switchCard(page)).toHaveCSS("border-radius", CARD_RADIUS);
    await expect(switchCard(page)).toHaveCSS(
      "background-color",
      LIGHT_SURFACE_FIELD,
    );
    await expect(switchCard(page).getByRole("switch")).toHaveCount(1);
    expect(card.x).toBeCloseTo(PAGE_GUTTER_PX, 0);
    expect(width - (card.x + card.width)).toBeCloseTo(PAGE_GUTTER_PX, 0);
    expect(row.height).toBeCloseTo(CARD_ROW_PX, 0);
    await expect(lockSwitch(page)).not.toHaveAttribute("aria-describedby");
  });

  test("draws the switch card on the dark surface", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openAppLock(page);

    await expect(switchCard(page)).toHaveCSS(
      "background-color",
      DARK_SURFACE_FIELD,
    );
  });

  test("sets Start app lock's heading 12px under the switch card", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    const card = await boxOf(switchCard(page));
    const heading = await boxOf(
      page.getByRole("heading", { name: "Start app lock" }),
    );

    expect(heading.y - (card.y + card.height)).toBeCloseTo(TIMES_GAP_PX, 0);
  });

  test("shows only the note and the switch while the lock is off", async ({
    page,
  }) => {
    await openAppLock(page);

    await expect(note(page)).toBeVisible();
    await expect(lockSwitch(page)).not.toBeChecked();
    await expect(page.getByRole("switch")).toHaveCount(1);
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByText("Start app lock")).toHaveCount(0);
    await expect(lockAfter(page)).toHaveCount(0);
    await expect(page.getByText(ONLY_WHEN_ON)).toHaveCount(0);
  });

  test("turns the lock on once the phone confirms it, and names it on Privacy and security", async ({
    page,
  }) => {
    await openAppLock(page);

    await lockSwitch(page).click();

    await expect(lockSwitch(page)).toBeChecked();
    expect(promptTitles).toEqual(["Turn on app lock"]);
    await expect(startAppLock(page)).toBeVisible();
    await page.goto("/settings/privacy");
    await expect(
      page.getByRole("link").filter({ hasText: "App lock" }),
    ).toContainText("On · after 1 minute");
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

  test("keeps Start app lock hidden when the check is cancelled", async ({
    page,
  }) => {
    turning = "notConfirmed";
    await openAppLock(page);

    await lockSwitch(page).click();
    await expect.poll(() => promptTitles).toEqual(["Turn on app lock"]);
    await expect(lockSwitch(page)).toBeEnabled();

    await expect(startAppLock(page)).toHaveCount(0);
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

  test("offers the four times as radio rows on the page once the lock is on, After 1 minute chosen", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await expect(startAppLock(page).getByRole("radio")).toHaveText(TIMES);
    await expect(time(page, "After 1 minute")).toBeChecked();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("locks after the time chosen, right on the page", async ({ page }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await time(page, "After 5 minutes").click();

    await expect(time(page, "After 5 minutes")).toBeChecked();
    expect(changes).toEqual(["lockAfter fiveMinutes"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("keeps the time chosen before when the lock is turned back on", async ({
    page,
  }) => {
    lock = { isOn: true, lockAfter: "fiveMinutes" };
    await openAppLock(page);

    await lockSwitch(page).click();
    await expect(startAppLock(page)).toHaveCount(0);
    await lockSwitch(page).click();

    await expect(time(page, "After 5 minutes")).toBeChecked();
  });

  test("names the time chosen on Privacy and security", async ({ page }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await time(page, "After 30 minutes").click();
    await expect(time(page, "After 30 minutes")).toBeChecked();
    await page.goto("/settings/privacy");

    await expect(
      page.getByRole("link").filter({ hasText: "App lock" }),
    ).toContainText("On · after 30 minutes");
  });

  test("offers no switch for hiding content in the recent apps screen", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);

    await expect(page.getByRole("switch")).toHaveCount(1);
    await expect(page.getByText(/hide content/i)).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    for (const isOn of [false, true]) {
      test(`has no accessibility violations in the ${colorScheme} theme with the lock ${isOn ? "on" : "off"}`, async ({
        page,
      }) => {
        lock = { ...NEW_APP_LOCK, isOn };
        await page.emulateMedia({ colorScheme });
        await openAppLock(page);

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  }

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

  test("keeps the old time checked and says so when a new one can't be kept", async ({
    page,
  }) => {
    lock = { ...NEW_APP_LOCK, isOn: true };
    await openAppLock(page);
    failingCode = "internal";

    await time(page, "After 30 minutes").click();

    await expect(page.getByText(NOT_CHANGED)).toBeVisible();
    await expect(time(page, "After 1 minute")).toBeChecked();
    await expect(time(page, "After 30 minutes")).not.toBeChecked();
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

  test("draws the lock switch and Start app lock as on a phone", async ({
    page,
  }) => {
    await openAppLock(page);
    const onPhone = [
      await cardLookOf(switchCard(page)),
      await cardLookOf(timesCard(page)),
    ];

    await page.setViewportSize(TABLET);
    await openAppLock(page);

    const lockToggle = await boxOf(lockSwitch(page));
    const times = await boxOf(startAppLock(page));
    expect(times.y).toBeGreaterThan(lockToggle.y + lockToggle.height);
    expect([
      await cardLookOf(switchCard(page)),
      await cardLookOf(timesCard(page)),
    ]).toEqual(onPhone);
  });

  test("hides Start app lock on a tablet while the lock is off", async ({
    page,
  }) => {
    lock = NEW_APP_LOCK;
    await page.setViewportSize(TABLET);
    await openAppLock(page);

    await expect(lockSwitch(page)).not.toBeChecked();
    await expect(startAppLock(page)).toHaveCount(0);
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
