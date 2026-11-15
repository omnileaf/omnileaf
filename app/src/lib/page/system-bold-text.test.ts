import { afterEach, expect, test, vi } from "vitest";

import { BoldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import type { PreferenceStore } from "#lib/preferences/stored-preference.ts";

import { followSystemBoldText } from "./system-bold-text.ts";

function memory(): PreferenceStore {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

const BOLD = () => Promise.resolve({ status: "ok", data: true } as const);

afterEach(() => {
  delete document.documentElement.dataset.boldText;
  vi.restoreAllMocks();
});

test("reads the phone's Bold text on Android", async () => {
  const choice = new BoldTextChoice(memory());

  await followSystemBoldText("android", BOLD, choice);

  expect(choice.isBold).toBe(true);
});

test("asks nothing off Android", async () => {
  const choice = new BoldTextChoice(memory());
  const read = vi.fn(BOLD);

  await followSystemBoldText("ios", read, choice);

  expect(read).not.toHaveBeenCalled();
  expect(choice.isBold).toBe(false);
});

test("asks nothing once the app has its own choice, and marks it straight away", async () => {
  const store = memory();
  new BoldTextChoice(store).choose(true);
  delete document.documentElement.dataset.boldText;
  const choice = new BoldTextChoice(store);
  const read = vi.fn(BOLD);

  await followSystemBoldText("android", read, choice);

  expect(read).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.boldText).toBe("");
});

test("reports a failed read and keeps text plain", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const choice = new BoldTextChoice(memory());
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
