import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { alertLook, TODAYS_ALERT_LOOK } from "./alert-look.ts";

const PLATFORMS: readonly Platform[] = [
  "ios",
  "android",
  "windows",
  "linux",
  "macos",
];

test.each(PLATFORMS)(
  "keeps today's Cancel and Confirm buttons on %s without the Mac alert",
  (platform) => {
    const look = alertLook(platform);

    expect(look.buttons).toEqual(TODAYS_ALERT_LOOK.buttons);
    expect(look.showsAppIcon).toBe(false);
  },
);

test.each(PLATFORMS.filter((platform) => platform !== "macos"))(
  "keeps %s's look when a dialog asks for the Mac alert",
  (platform) => {
    expect(alertLook(platform, undefined, "alert")).toBe(alertLook(platform));
  },
);

test("puts Confirm above Cancel and draws the app icon in the Mac alert", () => {
  const look = alertLook("macos", undefined, "alert");

  expect(look.actionOrder).toEqual(["confirm", "cancel"]);
  expect(look.showsAppIcon).toBe(true);
});
