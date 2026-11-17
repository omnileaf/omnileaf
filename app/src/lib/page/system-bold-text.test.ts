import { afterEach, expect, test, vi } from "vitest";

import { BoldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { memoryPreferenceStore } from "#lib/preferences/memory-preference-store.ts";

import { followSystemBoldText } from "./system-bold-text.ts";

const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos", "windows"];

const WATCHING = { status: "ok", data: null } as const;

function reportingEach(
  reports: readonly boolean[],
): (onChange: (isBold: boolean) => void) => Promise<typeof WATCHING> {
  return (onChange) => {
    reports.forEach(onChange);
    return Promise.resolve(WATCHING);
  };
}

afterEach(() => {
  delete document.documentElement.dataset.boldText;
  vi.restoreAllMocks();
});

test("follows the phone's Bold text on Android", async () => {
  const choice = new BoldTextChoice(memoryPreferenceStore());

  await followSystemBoldText("android", reportingEach([true]), choice);

  expect(choice.isBold).toBe(true);
});

test("follows the phone's Bold text each time it changes", async () => {
  const choice = new BoldTextChoice(memoryPreferenceStore());

  await followSystemBoldText("android", reportingEach([true, false]), choice);

  expect(choice.isBold).toBe(false);
  expect(document.documentElement.dataset.boldText).toBeUndefined();
});

test.each(ELSEWHERE)("watches nothing on %s", async (platform) => {
  const choice = new BoldTextChoice(memoryPreferenceStore());
  const watch = vi.fn(reportingEach([true]));

  await followSystemBoldText(platform, watch, choice);

  expect(watch).not.toHaveBeenCalled();
  expect(choice.isBold).toBe(false);
});

test("reports a failed watch and keeps text plain", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const choice = new BoldTextChoice(memoryPreferenceStore());
  const error = {
    code: "internal",
    message: "something went wrong inside the app",
  } as const;

  await followSystemBoldText(
    "android",
    () => Promise.resolve({ status: "error", error }),
    choice,
  );

  expect(reported).toHaveBeenCalledWith(error);
  expect(choice.isBold).toBe(false);
});
