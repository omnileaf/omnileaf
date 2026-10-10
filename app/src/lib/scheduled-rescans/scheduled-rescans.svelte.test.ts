import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { ScheduledRescansSetting } from "./scheduled-rescans.svelte";

const PREFERENCE_KEY = "omnileaf.scheduledRescans";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const refusingStore = {
  getItem: (): string | null => {
    throw new Error("storage is off");
  },
  setItem: () => {
    throw new Error("storage is off");
  },
};

test("checks folders on computers until the person turns it off", () => {
  const setting = new ScheduledRescansSetting(memoryStore());

  const computers = (["macos", "windows", "linux"] as const).map((platform) =>
    setting.isOnFor(platform),
  );

  expect(computers).toEqual([true, true, true]);
});

test("leaves folders unchecked on phones until the person turns it on", () => {
  const setting = new ScheduledRescansSetting(memoryStore());

  const phones = (["ios", "android"] as const).map((platform) =>
    setting.isOnFor(platform),
  );

  expect(phones).toEqual([false, false]);
});

test("starts from the choice kept from an earlier run on any platform", () => {
  const platforms: readonly Platform[] = ["ios", "macos"];
  const turnedOn = new ScheduledRescansSetting(
    memoryStore({ [PREFERENCE_KEY]: "on" }),
  );
  const turnedOff = new ScheduledRescansSetting(
    memoryStore({ [PREFERENCE_KEY]: "off" }),
  );

  expect(platforms.map((platform) => turnedOn.isOnFor(platform))).toEqual([
    true,
    true,
  ]);
  expect(platforms.map((platform) => turnedOff.isOnFor(platform))).toEqual([
    false,
    false,
  ]);
});

test("falls back to the platform's default when the kept choice isn't one it knows", () => {
  const setting = new ScheduledRescansSetting(
    memoryStore({ [PREFERENCE_KEY]: "sometimes" }),
  );

  expect(setting.isOnFor("linux")).toBe(true);
  expect(setting.isOnFor("android")).toBe(false);
});

test("keeps a new choice for the next run", () => {
  const store = memoryStore();
  const setting = new ScheduledRescansSetting(store);

  setting.turn(false);

  expect(setting.isOnFor("windows")).toBe(false);
  expect(store.values.get(PREFERENCE_KEY)).toBe("off");
});

test("still changes the choice when storage refuses it", () => {
  const setting = new ScheduledRescansSetting(refusingStore);

  setting.turn(true);

  expect(setting.isOnFor("ios")).toBe(true);
});
