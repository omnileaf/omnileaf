import { expect, test } from "vitest";

import { SkipUpNextSetting } from "./skip-up-next.svelte";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("shows what's up next until the person chooses to skip it", () => {
  const setting = new SkipUpNextSetting(memoryStore());

  expect(setting.isOn).toBe(false);
});

test("remembers skipping up next, and showing it again", () => {
  const store = memoryStore();

  new SkipUpNextSetting(store).turn(true);
  const skipped = new SkipUpNextSetting(store).isOn;
  new SkipUpNextSetting(store).turn(false);

  expect([skipped, new SkipUpNextSetting(store).isOn]).toEqual([true, false]);
});

test("shows what's up next when what was stored isn't a choice", () => {
  const store = memoryStore();
  store.setItem("omnileaf.skipUpNext", "maybe");

  expect(new SkipUpNextSetting(store).isOn).toBe(false);
});
