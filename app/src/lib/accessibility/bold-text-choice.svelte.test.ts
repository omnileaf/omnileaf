import { afterEach, expect, test } from "vitest";

import { memoryPreferenceStore } from "#lib/preferences/memory-preference-store.ts";

import { BoldTextChoice } from "./bold-text-choice.svelte.ts";

afterEach(() => {
  delete document.documentElement.dataset.boldText;
});

test("starts from the phone's Bold text", () => {
  const choice = new BoldTextChoice(memoryPreferenceStore());

  choice.followSystem(true);

  expect(choice.isBold).toBe(true);
  expect(document.documentElement.dataset.boldText).toBe("");
});

test("stays plain while the phone's Bold text is off", () => {
  const choice = new BoldTextChoice(memoryPreferenceStore());

  choice.followSystem(false);

  expect(choice.isBold).toBe(false);
  expect(document.documentElement.dataset.boldText).toBeUndefined();
});

test("keeps the app's own choice over the phone's once it is made", () => {
  const store = memoryPreferenceStore();
  const first = new BoldTextChoice(store);
  first.followSystem(true);
  first.choose(false);
  const next = new BoldTextChoice(store);

  next.followSystem(true);

  expect(next.isBold).toBe(false);
  expect(document.documentElement.dataset.boldText).toBeUndefined();
});

test("marks the document for bold text once it is chosen", () => {
  const choice = new BoldTextChoice(memoryPreferenceStore());

  choice.choose(true);

  expect(choice.isBold).toBe(true);
  expect(document.documentElement.dataset.boldText).toBe("");
});

test("marks a kept choice straight away", () => {
  const store = memoryPreferenceStore();
  new BoldTextChoice(store).choose(true);
  delete document.documentElement.dataset.boldText;

  new BoldTextChoice(store).markDocument();

  expect(document.documentElement.dataset.boldText).toBe("");
});

test("follows the phone again once its Bold text comes round to the app's choice", () => {
  const store = memoryPreferenceStore();
  const first = new BoldTextChoice(store);
  first.followSystem(false);
  first.choose(true);
  const next = new BoldTextChoice(store);
  next.followSystem(true);

  next.followSystem(false);

  expect(next.isBold).toBe(false);
  expect(new BoldTextChoice(store).isBold).toBe(false);
});

test("keeps no choice that matches the phone's Bold text", () => {
  const store = memoryPreferenceStore();
  const choice = new BoldTextChoice(store);
  choice.followSystem(true);
  choice.choose(false);
  choice.choose(true);

  choice.followSystem(false);

  expect(choice.isBold).toBe(false);
  expect(new BoldTextChoice(store).isBold).toBe(false);
});
