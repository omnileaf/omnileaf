import { expect, test } from "vitest";

import { AUTO_OFF_DELAY_MS } from "./screenshot-mode";
import { type Clock, ScreenshotMode } from "./screenshot-mode.svelte";

const START = Date.UTC(2026, 9, 3, 21, 14);

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function manualClock() {
  let time = START;
  let pending: { readonly time: number; readonly run: () => void }[] = [];
  const clock = {
    now: () => time,
    at: (at: number, run: () => void) => {
      const entry = { time: at, run };
      pending.push(entry);
      return () => {
        pending = pending.filter((other) => other !== entry);
      };
    },
    advanceBy(milliseconds: number) {
      time += milliseconds;
      const due = pending.filter((entry) => entry.time <= time);
      pending = pending.filter((entry) => entry.time > time);
      for (const entry of due) {
        entry.run();
      }
    },
  } satisfies Clock & Record<string, unknown>;
  return clock;
}

test("is off at first", () => {
  const mode = new ScreenshotMode(memoryStore(), manualClock());

  expect(mode.isOn).toBe(false);
});

test("is still on the next time the app starts", () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock).toggle();

  const next = new ScreenshotMode(store, clock);

  expect(next.isOn).toBe(true);
});

test("turns itself off when the hour is up", () => {
  const clock = manualClock();
  const mode = new ScreenshotMode(memoryStore(), clock);
  mode.toggle();

  clock.advanceBy(AUTO_OFF_DELAY_MS);

  expect(mode.isOn).toBe(false);
});

test("starts off when the hour ran out while the app was closed", () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock).toggle();
  const closed = manualClock();
  closed.advanceBy(AUTO_OFF_DELAY_MS);

  const next = new ScreenshotMode(store, closed);

  expect(next.isOn).toBe(false);
});

test("stays on past the hour once turning off after an hour is unchosen", () => {
  const clock = manualClock();
  const mode = new ScreenshotMode(memoryStore(), clock);
  mode.toggle();

  mode.choose({ option: "turnOffAfterAnHour", isChosen: false });
  clock.advanceBy(AUTO_OFF_DELAY_MS);

  expect(mode.isOn).toBe(true);
});

test("shows the label only while on and while the label is chosen", () => {
  const mode = new ScreenshotMode(memoryStore(), manualClock());
  const whileOff = mode.showsLabel;
  mode.toggle();
  const whileOn = mode.showsLabel;

  mode.choose({ option: "showLabel", isChosen: false });

  expect([whileOff, whileOn, mode.showsLabel]).toEqual([false, true, false]);
});

test("still turns on when storage can't be used", () => {
  const failingStore = {
    getItem: () => {
      throw new Error("storage is unavailable");
    },
    setItem: () => {
      throw new Error("storage is unavailable");
    },
  };
  const mode = new ScreenshotMode(failingStore, manualClock());

  mode.toggle();

  expect(mode.isOn).toBe(true);
});
