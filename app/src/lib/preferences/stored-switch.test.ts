import { expect, test } from "vitest";

import type { PreferenceStore } from "./stored-preference.ts";
import { StoredSwitch } from "./stored-switch.ts";

function memory(): PreferenceStore {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

test("reads nothing chosen until the switch is set", () => {
  expect(new StoredSwitch(memory(), "omnileaf.test").read()).toBeUndefined();
});

test("reads back each position it was set to", () => {
  const store = memory();
  const stored = new StoredSwitch(store, "omnileaf.test");

  stored.write(true);
  const on = new StoredSwitch(store, "omnileaf.test").read();
  stored.write(false);
  const off = new StoredSwitch(store, "omnileaf.test").read();

  expect([on, off]).toEqual([true, false]);
});

test("reads a value it doesn't know as nothing chosen", () => {
  const store = memory();
  store.setItem("omnileaf.test", "maybe");

  expect(new StoredSwitch(store, "omnileaf.test").read()).toBeUndefined();
});
