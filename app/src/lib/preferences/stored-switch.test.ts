import { expect, test } from "vitest";

import { memoryPreferenceStore } from "./memory-preference-store.ts";
import { StoredSwitch } from "./stored-switch.ts";

test("reads nothing chosen until the switch is set", () => {
  expect(
    new StoredSwitch(memoryPreferenceStore(), "omnileaf.test").read(),
  ).toBeUndefined();
});

test("reads back each position it was set to", () => {
  const store = memoryPreferenceStore();
  const stored = new StoredSwitch(store, "omnileaf.test");

  stored.writeIfPossible(true);
  const on = new StoredSwitch(store, "omnileaf.test").read();
  stored.writeIfPossible(false);
  const off = new StoredSwitch(store, "omnileaf.test").read();

  expect([on, off]).toEqual([true, false]);
});

test("reads a value it doesn't know as nothing chosen", () => {
  const store = memoryPreferenceStore();
  store.setItem("omnileaf.test", "maybe");

  expect(new StoredSwitch(store, "omnileaf.test").read()).toBeUndefined();
});

test("reads nothing chosen once the switch is forgotten", () => {
  const store = memoryPreferenceStore();
  new StoredSwitch(store, "omnileaf.test").writeIfPossible(true);

  new StoredSwitch(store, "omnileaf.test").forgetIfPossible();

  expect(new StoredSwitch(store, "omnileaf.test").read()).toBeUndefined();
});

test("keeps its position, without failing, where storage refuses to forget", () => {
  const refusingToForget = {
    ...memoryPreferenceStore(),
    removeItem: () => {
      throw new Error("storage is off");
    },
  };
  const stored = new StoredSwitch(refusingToForget, "omnileaf.test");
  stored.writeIfPossible(true);

  const forgetting = () => {
    stored.forgetIfPossible();
  };

  expect(forgetting).not.toThrow();
  expect(stored.read()).toBe(true);
});
