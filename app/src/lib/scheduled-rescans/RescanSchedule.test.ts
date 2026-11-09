import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import RescanSchedule from "./RescanSchedule.svelte";
import { ScheduledRescansSetting } from "./scheduled-rescans.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("says Every day when folders are checked and Off when they are not", async () => {
  followCorePlatform("android");
  const schedule = new ScheduledRescansSetting(memoryStore());
  const screen = await render(RescanSchedule, {
    schedule,
    platform: "android",
  });

  await expect.element(screen.getByText("Off")).toBeVisible();

  schedule.turn(true);

  await expect.element(screen.getByText("Every day")).toBeVisible();
});

test("opens a choice of Every day or Off that sets the same scheduled rescans", async () => {
  followCorePlatform("android");
  const schedule = new ScheduledRescansSetting(memoryStore());
  const screen = await render(RescanSchedule, {
    schedule,
    platform: "android",
  });

  await screen.getByRole("button", { name: /^Rescan folders/ }).click();
  await screen.getByRole("radio", { name: "Every day" }).click();

  expect(schedule.isOnFor("android")).toBe(true);
});

test("turns scheduled rescans off from the same choice", async () => {
  followCorePlatform("android");
  const schedule = new ScheduledRescansSetting(memoryStore());
  schedule.turn(true);
  const screen = await render(RescanSchedule, {
    schedule,
    platform: "android",
  });

  await screen.getByRole("button", { name: /^Rescan folders/ }).click();
  await screen.getByRole("radio", { name: "Off" }).click();

  expect(schedule.isOnFor("android")).toBe(false);
});
