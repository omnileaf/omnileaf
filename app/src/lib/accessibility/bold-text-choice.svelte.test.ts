import { afterEach, expect, test } from "vitest";

import type { PreferenceStore } from "#lib/preferences/stored-preference.ts";

import { BoldTextChoice } from "./bold-text-choice.svelte.ts";

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

test("marks a kept choice straight away", () => {
  const store = memory();
  new BoldTextChoice(store).choose(true);
  delete document.documentElement.dataset.boldText;

  new BoldTextChoice(store).markDocument();

  expect(document.documentElement.dataset.boldText).toBe("");
});
