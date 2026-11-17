import { afterEach, expect, test } from "vitest";

import { memoryPreferenceStore } from "#lib/preferences/memory-preference-store.ts";

import { ContrastChoice } from "./contrast-choice.svelte.ts";

afterEach(() => {
  delete document.documentElement.dataset.contrast;
});

test("starts from the phone's contrast", () => {
  const choice = new ContrastChoice(memoryPreferenceStore());

  choice.followSystem("medium");

  expect(choice.isHigher).toBe(true);
  expect(document.documentElement.dataset.contrast).toBe("medium");
});

test("keeps a choice that differs from the phone's contrast", () => {
  const store = memoryPreferenceStore();
  const first = new ContrastChoice(store);
  first.followSystem("standard");
  first.choose(true);
  const next = new ContrastChoice(store);

  next.followSystem("standard");

  expect(next.isHigher).toBe(true);
  expect(document.documentElement.dataset.contrast).toBe("high");
});

test("follows the phone again once Higher contrast is tapped back to match it", () => {
  const store = memoryPreferenceStore();
  const choice = new ContrastChoice(store);
  choice.followSystem("medium");
  choice.choose(false);
  choice.choose(true);

  choice.followSystem("standard");

  expect(choice.isHigher).toBe(false);
  expect(new ContrastChoice(store).isHigher).toBe(false);
});

test("follows the phone again once its contrast comes round to the app's choice", () => {
  const store = memoryPreferenceStore();
  const first = new ContrastChoice(store);
  first.followSystem("standard");
  first.choose(true);
  const next = new ContrastChoice(store);
  next.followSystem("high");

  next.followSystem("standard");

  expect(next.isHigher).toBe(false);
  expect(document.documentElement.dataset.contrast).toBeUndefined();
  expect(new ContrastChoice(store).isHigher).toBe(false);
});

test("draws the phone's own contrast level once a choice matching it is dropped", () => {
  const store = memoryPreferenceStore();
  const choice = new ContrastChoice(store);
  choice.followSystem("standard");
  choice.choose(true);

  choice.followSystem("medium");

  expect(choice.isHigher).toBe(true);
  expect(document.documentElement.dataset.contrast).toBe("medium");
});

test("keeps an off choice over a phone asking for more contrast", () => {
  const choice = new ContrastChoice(memoryPreferenceStore());
  choice.followSystem("medium");
  choice.choose(false);

  choice.followSystem("high");

  expect(choice.isHigher).toBe(false);
  expect(document.documentElement.dataset.contrast).toBeUndefined();
});
