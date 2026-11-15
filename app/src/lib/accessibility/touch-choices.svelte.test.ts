import { afterEach, expect, test } from "vitest";

import type { PreferenceStore } from "#lib/preferences/stored-preference.ts";

import { TouchChoices } from "./touch-choices.svelte.ts";

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
  delete document.documentElement.dataset.tapTargets;
});

test("holds a long press for half a second until another length is chosen", () => {
  const choices = new TouchChoices(memory());

  expect(choices.longPress).toBe("medium");
  expect(choices.longPressMs).toBe(500);
});

test.each([
  ["short", 300],
  ["medium", 500],
  ["long", 800],
] as const)("holds a %s long press for %i ms", (length, heldMs) => {
  const choices = new TouchChoices(memory());

  choices.chooseLongPress(length);

  expect(choices.longPressMs).toBe(heldMs);
});

test("keeps the long press length for the next launch", () => {
  const store = memory();
  new TouchChoices(store).chooseLongPress("long");

  const next = new TouchChoices(store);

  expect(next.longPress).toBe("long");
});

test("marks the document for larger tap targets once they are chosen, and keeps them", () => {
  const store = memory();
  const choices = new TouchChoices(store);

  choices.chooseLargerTargets(true);

  expect(document.documentElement.dataset.tapTargets).toBe("larger");
  expect(new TouchChoices(store).hasLargerTargets).toBe(true);
});

test("takes the mark away once larger tap targets are turned off", () => {
  const choices = new TouchChoices(memory());
  choices.chooseLargerTargets(true);

  choices.chooseLargerTargets(false);

  expect(document.documentElement.dataset.tapTargets).toBeUndefined();
});

test("falls back to the medium long press for a length it doesn't know", () => {
  const store = memory();
  store.setItem("omnileaf.longPress", "forever");

  expect(new TouchChoices(store).longPressMs).toBe(500);
});

test("marks the document again from the kept choice when the app opens", () => {
  const store = memory();
  new TouchChoices(store).chooseLargerTargets(true);
  delete document.documentElement.dataset.tapTargets;

  new TouchChoices(store).markDocument();

  expect(document.documentElement.dataset.tapTargets).toBe("larger");
});
