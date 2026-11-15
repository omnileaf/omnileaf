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

test("follows a 24-hour clock the phone names while on System", () => {
  const setting = new TimeFormatSetting(memoryStore());

  setting.followSystemClock("twentyFourHour");

  expect(setting.hourCycle).toBe("h23");
});

test("follows a 12-hour clock the phone names while on System", () => {
  const setting = new TimeFormatSetting(memoryStore());

  setting.followSystemClock("twelveHour");

  expect(setting.hourCycle).toBe("h12");
});

test("keeps a chosen clock whatever the phone names", () => {
  const setting = new TimeFormatSetting(memoryStore());
  setting.choose("twelveHour");

  setting.followSystemClock("twentyFourHour");

  expect(setting.hourCycle).toBe("h12");
});

test("leaves the clock to the language where the system names none", () => {
  const setting = new TimeFormatSetting(memoryStore());

  setting.followSystemClock("followsLanguage");

  expect(setting.hourCycle).toBeUndefined();
});

test("names the system clock by the phone's clock over the language's", () => {
  const setting = new TimeFormatSetting(memoryStore());

  setting.followSystemClock("twentyFourHour");

  expect(setting.labels.system).toBe("Follow the system (24-hour)");
});
