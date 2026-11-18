import type { Page } from "@playwright/test";

import type { NotificationAccess } from "../../src/lib/ipc/bindings.ts";

import type { FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const UPDATES_HELP =
  "For update notifications and finished downloads. Asked when you turn on Notify me about updates.";

let access: NotificationAccess = "notAsked";

const BUILD_WITH_THE_CHECK: FakeBackend = {
  ...DEFAULT_BACKEND,
  appInfo: () => ({ ...fakeAppInfo("android"), checksForUpdates: true }),
  updateStatus: () => ({ isAutomatic: false, release: { kind: "unchecked" } }),
  checkForUpdatesIfDue: () => ({
    outcome: null,
    status: { isAutomatic: false, release: { kind: "unchecked" } },
  }),
  updateNotices: () => ({ isOn: false, canShow: access === "allowed", access }),
  rememberUpdateNoticeWords: () => null,
};

test.use({ backend: BUILD_WITH_THE_CHECK });

testOnlyInItsWebview("android");

function notificationsRow(page: Page) {
  return page
    .getByRole("list", { name: "Permissions" })
    .getByRole("listitem")
    .filter({ hasText: "Notifications" });
}

for (const [shown, state] of [
  ["Allowed", "allowed"],
  ["Not asked yet", "notAsked"],
  ["Not allowed", "notAllowed"],
] as const) {
  test(`shows notifications as ${shown} when Android says so, and what they're for`, async ({
    page,
  }) => {
    access = state;

    await page.goto("/settings/privacy/permissions");

    await expect(notificationsRow(page)).toHaveText(
      `Notifications ${UPDATES_HELP} ${shown}`,
    );
  });
}

test.describe("a build without the check", () => {
  test.use({
    backend: { ...BUILD_WITH_THE_CHECK, appInfo: () => fakeAppInfo("android") },
  });

  test("keeps notifications for finished downloads, not asked", async ({
    page,
  }) => {
    access = "allowed";

    await page.goto("/settings/privacy/permissions");

    await expect(notificationsRow(page)).toHaveText(
      "Notifications For finished downloads. Asked when downloads arrive. Not asked yet",
    );
  });
});
