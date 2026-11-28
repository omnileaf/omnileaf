import { expect, test } from "vitest";

import { memoryPreferenceStore } from "#lib/preferences/memory-preference-store.ts";

import { TapOpenTabSetting } from "./tap-open-tab.svelte.ts";

const KEY = "omnileaf.tapOpenTab";

test("is on where nothing was ever chosen", () => {
  const setting = new TapOpenTabSetting(memoryPreferenceStore());

  expect(setting.isOn).toBe(true);
});

test("stays off where it was turned off before", () => {
  const store = memoryPreferenceStore();
  store.setItem(KEY, "off");

  const setting = new TapOpenTabSetting(store);

  expect(setting.isOn).toBe(false);
});

test("stays on where it was turned on before", () => {
  const store = memoryPreferenceStore();
  store.setItem(KEY, "on");

  const setting = new TapOpenTabSetting(store);

  expect(setting.isOn).toBe(true);
});

test("reads a turn off back on the next launch", () => {
  const store = memoryPreferenceStore();
  new TapOpenTabSetting(store).turn(false);

  const relaunched = new TapOpenTabSetting(store);

  expect(relaunched.isOn).toBe(false);
});

test("is on, without failing, where storage refuses reads", () => {
  const refusing = {
    getItem: () => {
      throw new Error("storage is off");
    },
    setItem: () => undefined,
  };

  const setting = new TapOpenTabSetting(refusing);

  expect(setting.isOn).toBe(true);
});
