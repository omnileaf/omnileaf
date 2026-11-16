import { afterEach, expect, test } from "vitest";

import { memoryPreferenceStore } from "#lib/preferences/memory-preference-store.ts";

import { TextSizeChoice } from "./text-size-choice.svelte.ts";

afterEach(() => {
  delete document.documentElement.dataset.textSize;
});

test("follows the phone's text size until another size is chosen", () => {
  const choice = new TextSizeChoice(memoryPreferenceStore());

  choice.markDocument();

  expect(choice.size).toBe("system");
  expect(document.documentElement.dataset.textSize).toBeUndefined();
});

test.each(["larger", "largest"] as const)(
  "marks the document for %s text once it is chosen, and keeps it",
  (size) => {
    const store = memoryPreferenceStore();
    const choice = new TextSizeChoice(store);

    choice.choose(size);

    expect(document.documentElement.dataset.textSize).toBe(size);
    expect(new TextSizeChoice(store).size).toBe(size);
  },
);

test("takes the mark away once the phone's size is chosen again", () => {
  const choice = new TextSizeChoice(memoryPreferenceStore());
  choice.choose("largest");

  choice.choose("system");

  expect(document.documentElement.dataset.textSize).toBeUndefined();
});

test("follows the phone's text size for a size it doesn't know", () => {
  const store = memoryPreferenceStore();
  store.setItem("omnileaf.textSize", "huge");

  expect(new TextSizeChoice(store).size).toBe("system");
});

test("marks the document again from the kept choice when the app opens", () => {
  const store = memoryPreferenceStore();
  new TextSizeChoice(store).choose("larger");
  delete document.documentElement.dataset.textSize;

  new TextSizeChoice(store).markDocument();

  expect(document.documentElement.dataset.textSize).toBe("larger");
});
