import { afterEach, expect, test, vi } from "vitest";

import { BoldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { memoryPreferenceStore } from "#lib/preferences/memory-preference-store.ts";

import { followSystemBoldText } from "./system-bold-text.ts";

const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos", "windows"];

const BOLD = () => Promise.resolve({ status: "ok", data: true } as const);

afterEach(() => {
  delete document.documentElement.dataset.boldText;
  vi.restoreAllMocks();
});

test("reads the phone's Bold text on Android", async () => {
  const choice = new BoldTextChoice(memoryPreferenceStore());

  await followSystemBoldText("android", BOLD, choice);

  expect(choice.isBold).toBe(true);
});

test.each(ELSEWHERE)("asks nothing on %s", async (platform) => {
  const choice = new BoldTextChoice(memoryPreferenceStore());
  const read = vi.fn(BOLD);

  await followSystemBoldText(platform, read, choice);

  expect(read).not.toHaveBeenCalled();
  expect(choice.isBold).toBe(false);
});

test("asks nothing once the app has its own choice", async () => {
  const store = memoryPreferenceStore();
  new BoldTextChoice(store).choose(true);
  const choice = new BoldTextChoice(store);
  const read = vi.fn(BOLD);

  await followSystemBoldText("android", read, choice);

  expect(read).not.toHaveBeenCalled();
});

test("reports a failed read and keeps text plain", async () => {
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
