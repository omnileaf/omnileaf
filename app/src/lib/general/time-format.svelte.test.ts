import { expect, test } from "vitest";

import { TimeFormatSetting } from "./time-format.svelte";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("follows the system's clock until a format is chosen", () => {
  const setting = new TimeFormatSetting(memoryStore());

  expect([setting.choice, setting.hourCycle]).toEqual(["system", undefined]);
});

test("remembers a 12-hour clock and names its hour cycle", () => {
  const store = memoryStore();

  new TimeFormatSetting(store).choose("twelveHour");
  const setting = new TimeFormatSetting(store);

  expect([setting.choice, setting.hourCycle]).toEqual(["twelveHour", "h12"]);
});

test("names a 24-hour clock's hour cycle", () => {
  const setting = new TimeFormatSetting(memoryStore());

  setting.choose("twentyFourHour");

  expect(setting.hourCycle).toBe("h23");
});
