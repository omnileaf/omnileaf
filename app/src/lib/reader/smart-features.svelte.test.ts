import { expect, test } from "vitest";

import { SmartFeatures } from "./smart-features.svelte";

const KEY = "omnileaf.smartFeatures";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("starts with every smart feature on", () => {
  const features = new SmartFeatures(memoryStore());

  expect([
    features.learnsReadingSpeed,
    features.showsTimeLeft,
    features.showsPagePreviews,
  ]).toEqual([true, true, true]);
});

test("shows no time left while it doesn't learn the reading speed, keeping the choice for later", () => {
  const features = new SmartFeatures(memoryStore());

  features.turn("learnsReadingSpeed", false);
  const whileUnlearned = features.showsTimeLeft;
  features.turn("learnsReadingSpeed", true);

  expect([whileUnlearned, features.showsTimeLeft]).toEqual([false, true]);
});

test("turns every smart feature off at once", () => {
  const features = new SmartFeatures(memoryStore());

  features.turnAllOff();

  expect([
    features.learnsReadingSpeed,
    features.showsTimeLeft,
    features.showsPagePreviews,
  ]).toEqual([false, false, false]);
});

test("keeps what was turned off for the next time", () => {
  const store = memoryStore();
  new SmartFeatures(store).turn("showsPagePreviews", false);

  const again = new SmartFeatures(store);

  expect([again.showsPagePreviews, again.showsTimeLeft]).toEqual([false, true]);
});

test("reads what it can't make sense of as every feature on", () => {
  const store = memoryStore();
  store.values.set(KEY, JSON.stringify({ showsTimeLeft: "no" }));
  const garbled = new SmartFeatures(store);
  store.values.set(KEY, "{not json");
  const broken = new SmartFeatures(store);

  expect([garbled.showsTimeLeft, broken.learnsReadingSpeed]).toEqual([
    true,
    true,
  ]);
});
