import { afterEach, expect, test, vi } from "vitest";

import type { IpcError } from "#lib/ipc/bindings.ts";
import type { Notice, Notices } from "#lib/notices/notices.ts";

import { openSettingsOrWarn } from "./open-settings.ts";

const NOT_OPENED: IpcError = {
  code: "systemSettingsUnavailable",
  message: "the system's settings could not be opened",
};

function shownNotices(): Pick<Notices, "show"> & { readonly shown: Notice[] } {
  const shown: Notice[] = [];
  return {
    shown,
    show: (notice) => {
      shown.push(notice);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
  vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const notices = shownNotices();

  await openSettingsOrWarn(
    () => Promise.resolve({ status: "error", error: NOT_OPENED }),
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

test("reports why the settings didn't open", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);

  await openSettingsOrWarn(
    () => Promise.resolve({ status: "error", error: NOT_OPENED }),
    shownNotices(),
    "The settings didn’t open",
  );

  expect(reported).toHaveBeenCalledWith(NOT_OPENED);
});
