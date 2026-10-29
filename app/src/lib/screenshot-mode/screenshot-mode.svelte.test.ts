import { expect, test } from "vitest";

import { AUTO_OFF_DELAY_MS } from "./screenshot-mode";
import {
  type Clock,
  ScreenshotMode,
  type ScreenshotModeEngine,
} from "./screenshot-mode.svelte";

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

function quietEngine(): ScreenshotModeEngine {
  return { setOn: () => Promise.resolve(), reportFailure: () => undefined };
}

function recordingEngine() {
  const told: boolean[] = [];
  return {
    told,
    setOn: (isOn: boolean) => {
      told.push(isOn);
      return Promise.resolve();
    },
    reportFailure: () => undefined,
  } satisfies ScreenshotModeEngine & { told: boolean[] };
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
    sleepFor(milliseconds: number) {
      time += milliseconds;
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
  const mode = new ScreenshotMode(memoryStore(), manualClock(), quietEngine());

  expect(mode.isOn).toBe(false);
});

test("is still on the next time the app starts", () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock, quietEngine()).toggle();

  const next = new ScreenshotMode(store, clock, quietEngine());

  expect(next.isOn).toBe(true);
});

test("turns itself off when the hour is up", () => {
  const clock = manualClock();
  const mode = new ScreenshotMode(memoryStore(), clock, quietEngine());
  mode.toggle();

  clock.advanceBy(AUTO_OFF_DELAY_MS);

  expect(mode.isOn).toBe(false);
});

test("turns off on settling once the hour ran out while timers were paused", () => {
  const clock = manualClock();
  const mode = new ScreenshotMode(memoryStore(), clock, quietEngine());
  mode.toggle();
  clock.sleepFor(AUTO_OFF_DELAY_MS);

  mode.settle();

  expect(mode.isOn).toBe(false);
});

test("starts off when the hour ran out while the app was closed", () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock, quietEngine()).toggle();
  const closed = manualClock();
  closed.advanceBy(AUTO_OFF_DELAY_MS);

  const next = new ScreenshotMode(store, closed, quietEngine());

  expect(next.isOn).toBe(false);
});

test("stays on past the hour once turning off after an hour is unchosen", () => {
  const clock = manualClock();
  const mode = new ScreenshotMode(memoryStore(), clock, quietEngine());
  mode.toggle();

  mode.choose({ option: "turnOffAfterAnHour", isChosen: false });
  clock.advanceBy(AUTO_OFF_DELAY_MS);

  expect(mode.isOn).toBe(true);
});

test("shows the label only while on and while the label is chosen", () => {
  const mode = new ScreenshotMode(memoryStore(), manualClock(), quietEngine());
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
  const mode = new ScreenshotMode(failingStore, manualClock(), quietEngine());

  mode.toggle();

  expect(mode.isOn).toBe(true);
});

test("tells the engine each time it turns on or off", () => {
  const engine = recordingEngine();
  const mode = new ScreenshotMode(memoryStore(), manualClock(), engine);

  mode.toggle();
  mode.toggle();

  expect(engine.told).toEqual([true, false]);
});

test("tells the engine nothing when an option changes but it stays on", () => {
  const engine = recordingEngine();
  const mode = new ScreenshotMode(memoryStore(), manualClock(), engine);
  mode.toggle();

  mode.choose({ option: "showLabel", isChosen: false });

  expect(engine.told).toEqual([true]);
});

test("tells the engine when the hour is up", () => {
  const engine = recordingEngine();
  const clock = manualClock();
  const mode = new ScreenshotMode(memoryStore(), clock, engine);
  mode.toggle();

  clock.advanceBy(AUTO_OFF_DELAY_MS);

  expect(engine.told).toEqual([true, false]);
});

test("tells the engine it is on when the app starts with it on", () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock, quietEngine()).toggle();
  const engine = recordingEngine();

  new ScreenshotMode(store, clock, engine);

  expect(engine.told).toEqual([true]);
});

test("leaves the engine alone when the app starts with it off", () => {
  const engine = recordingEngine();

  new ScreenshotMode(memoryStore(), manualClock(), engine);

  expect(engine.told).toEqual([]);
});

test("is ready for library reads only once the engine has heard it is on", async () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock, quietEngine()).toggle();
  let answer: () => void = () => undefined;
  const slowEngine: ScreenshotModeEngine = {
    setOn: () =>
      new Promise<void>((resolve) => {
        answer = resolve;
      }),
    reportFailure: () => undefined,
  };
  const mode = new ScreenshotMode(store, clock, slowEngine);
  let isReady = false;
  void mode.engineReady.then(() => {
    isReady = true;
  });
  await Promise.resolve();
  const beforeAnswer = isReady;

  answer();
  await mode.engineReady;

  expect([beforeAnswer, isReady]).toEqual([false, true]);
});

test("is still ready for library reads when the engine can't be told", async () => {
  const store = memoryStore();
  const clock = manualClock();
  new ScreenshotMode(store, clock, quietEngine()).toggle();
  const failingEngine: ScreenshotModeEngine = {
    setOn: () => Promise.reject(new Error("the engine is gone")),
    reportFailure: () => undefined,
  };

  const mode = new ScreenshotMode(store, clock, failingEngine);

  await expect(mode.engineReady).resolves.toBeUndefined();
});

test("turns itself back off and reports when the engine can't be told it is on", async () => {
  const reported: unknown[] = [];
  const failure = new Error("the engine is gone");
  const mode = new ScreenshotMode(memoryStore(), manualClock(), {
    setOn: (isOn) => (isOn ? Promise.reject(failure) : Promise.resolve()),
    reportFailure: (error) => reported.push(error),
  });

  mode.toggle();
  await mode.engineReady;

  expect([mode.isOn, reported]).toEqual([false, [failure]]);
});
