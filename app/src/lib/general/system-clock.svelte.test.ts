import { expect, test } from "vitest";

import type { SystemClock } from "#lib/ipc/bindings.ts";

import { followSystemClock } from "./system-clock";
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

function reading(clock: SystemClock) {
  return () => Promise.resolve({ status: "ok" as const, data: clock });
}

test("asks Android for its clock and shows times on it", async () => {
  const timeFormat = new TimeFormatSetting(memoryStore());

  await followSystemClock("android", timeFormat, reading("twentyFourHour"));

  expect(timeFormat.hourCycle).toBe("h23");
});

test("leaves the clock to the language when Android can't say", async () => {
  const timeFormat = new TimeFormatSetting(memoryStore());

  await followSystemClock("android", timeFormat, () =>
    Promise.resolve({
      status: "error",
      error: { code: "internal", message: "timed out" },
    }),
  );

  expect(timeFormat.hourCycle).toBeUndefined();
});

test("doesn't ask anywhere but Android", async () => {
  const timeFormat = new TimeFormatSetting(memoryStore());
  let asked = false;

  for (const platform of ["ios", "linux", "macos", "windows"] as const) {
    await followSystemClock(platform, timeFormat, () => {
      asked = true;
      return reading("twentyFourHour")();
    });
  }

  expect(asked).toBe(false);
});
