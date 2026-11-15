import { expect, test } from "vitest";

import type { Notice } from "#lib/notices/notices.ts";

import { openSettingsOrWarn } from "./open-settings.ts";

function shownNotices(): {
  readonly shown: Notice[];
  show(notice: Notice): void;
} {
  const shown: Notice[] = [];
  return {
    shown,
    show: (notice) => {
      shown.push(notice);
    },
  };
}

test("says nothing once the settings open", async () => {
  const notices = shownNotices();

  await openSettingsOrWarn(
    () => Promise.resolve({ status: "ok", data: null }),
    notices,
    "The settings didn’t open",
  );

  expect(notices.shown).toEqual([]);
});

test("warns with the given title when the settings don't open", async () => {
  const notices = shownNotices();

  await openSettingsOrWarn(
    () =>
      Promise.resolve({
        status: "error",
        error: {
          code: "systemSettingsUnavailable",
          message: "the system's settings could not be opened",
        },
      }),
    notices,
    "The settings didn’t open",
  );

  expect(notices.shown).toEqual([
    expect.objectContaining({
      tone: "warning",
      title: "The settings didn’t open",
    }),
  ]);
});
