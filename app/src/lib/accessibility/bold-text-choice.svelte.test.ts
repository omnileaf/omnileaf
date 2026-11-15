import { afterEach, expect, test, vi } from "vitest";

import type { PreferenceStore } from "#lib/preferences/stored-preference.ts";

import {
  BoldTextChoice,
  boldTextChoice,
  followSystemBoldText,
} from "./bold-text-choice.svelte.ts";

function memory(): PreferenceStore {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

afterEach(() => {
  delete document.documentElement.dataset.boldText;
  vi.restoreAllMocks();
});

test("starts from the phone's Bold text", () => {
  const choice = new BoldTextChoice(memory());

  choice.followSystem(true);

  expect(choice.isBold).toBe(true);
  expect(document.documentElement.dataset.boldText).toBe("");
});

test("stays plain while the phone's Bold text is off", () => {
  const choice = new BoldTextChoice(memory());

  choice.followSystem(false);

  expect(choice.isBold).toBe(false);
  expect(document.documentElement.dataset.boldText).toBeUndefined();
});

test("keeps the app's own choice over the phone's once it is made", () => {
  const store = memory();
  new BoldTextChoice(store).choose(false);
  const next = new BoldTextChoice(store);

  next.followSystem(true);

  expect(next.isBold).toBe(false);
  expect(document.documentElement.dataset.boldText).toBeUndefined();
});

test("marks the document for bold text once it is chosen", () => {
  const choice = new BoldTextChoice(memory());

  choice.choose(true);

  expect(choice.isBold).toBe(true);
  expect(document.documentElement.dataset.boldText).toBe("");
});

test("reads the phone's Bold text on Android", async () => {
  await followSystemBoldText("android", () =>
    Promise.resolve({ status: "ok", data: true }),
  );

  expect(boldTextChoice.isBold).toBe(true);
});

test("keeps text plain off Android without asking", async () => {
  const read = vi.fn(() =>
    Promise.resolve({ status: "ok", data: true } as const),
  );

  await followSystemBoldText("ios", read);

  expect(read).not.toHaveBeenCalled();
  expect(boldTextChoice.isBold).toBe(false);
});

test("reports a failed read and keeps text plain", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = {
    code: "internal",
    message: "something went wrong inside the app",
  } as const;

  await followSystemBoldText("android", () =>
    Promise.resolve({ status: "error", error }),
  );

  expect(reported).toHaveBeenCalledWith(error);
  expect(boldTextChoice.isBold).toBe(false);
});
