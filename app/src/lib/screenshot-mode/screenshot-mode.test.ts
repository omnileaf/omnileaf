import { describe, expect, test } from "vitest";

import {
  AUTO_OFF_DELAY_MS,
  chooseOption,
  DEFAULT_SCREENSHOT_MODE,
  parseScreenshotModeSettings,
  type ScreenshotModeSettings,
  settle,
  turnOff,
  turnOn,
} from "./screenshot-mode";

const NOW = Date.UTC(2026, 9, 3, 21, 14);
const AN_HOUR_LATER = NOW + AUTO_OFF_DELAY_MS;

const WITHOUT_AUTO_OFF: ScreenshotModeSettings = {
  ...DEFAULT_SCREENSHOT_MODE,
  options: { ...DEFAULT_SCREENSHOT_MODE.options, turnOffAfterAnHour: false },
};

describe("turning it on", () => {
  test("turns off an hour later while that option is on", () => {
    const settings = turnOn(DEFAULT_SCREENSHOT_MODE, NOW);

    expect(settings.activity).toEqual({
      kind: "onUntil",
      turnsOffAt: AN_HOUR_LATER,
    });
  });

  test("stays on until turned off while that option is off", () => {
    const settings = turnOn(WITHOUT_AUTO_OFF, NOW);

    expect(settings.activity).toEqual({ kind: "on" });
  });

  test("keeps the options as they were", () => {
    const settings = turnOff(turnOn(WITHOUT_AUTO_OFF, NOW));

    expect(settings).toEqual(WITHOUT_AUTO_OFF);
  });
});

describe("choosing an option", () => {
  test("starts the hour when turning off after an hour is chosen while on", () => {
    const later = NOW + 5000;

    const settings = chooseOption(
      turnOn(WITHOUT_AUTO_OFF, NOW),
      { option: "turnOffAfterAnHour", isChosen: true },
      later,
    );

    expect(settings.activity).toEqual({
      kind: "onUntil",
      turnsOffAt: later + AUTO_OFF_DELAY_MS,
    });
  });

  test("stays on when turning off after an hour is unchosen while on", () => {
    const settings = chooseOption(
      turnOn(DEFAULT_SCREENSHOT_MODE, NOW),
      { option: "turnOffAfterAnHour", isChosen: false },
      NOW,
    );

    expect(settings.activity).toEqual({ kind: "on" });
    expect(settings.options.turnOffAfterAnHour).toBe(false);
  });

  test("keeps it off while off", () => {
    const settings = chooseOption(
      DEFAULT_SCREENSHOT_MODE,
      { option: "turnOffAfterAnHour", isChosen: true },
      NOW,
    );

    expect(settings.activity).toEqual({ kind: "off" });
  });

  test("leaves the deadline alone for the other options", () => {
    const settings = chooseOption(
      turnOn(DEFAULT_SCREENSHOT_MODE, NOW),
      { option: "showLabel", isChosen: false },
      NOW + 5000,
    );

    expect(settings.activity).toEqual({
      kind: "onUntil",
      turnsOffAt: AN_HOUR_LATER,
    });
    expect(settings.options.showLabel).toBe(false);
  });
});

describe("settling at a time", () => {
  test("turns off once the hour is up", () => {
    const settings = settle(
      turnOn(DEFAULT_SCREENSHOT_MODE, NOW),
      AN_HOUR_LATER,
    );

    expect(settings.activity).toEqual({ kind: "off" });
  });

  test("stays on before the hour is up", () => {
    const on = turnOn(DEFAULT_SCREENSHOT_MODE, NOW);

    expect(settle(on, AN_HOUR_LATER - 1)).toEqual(on);
  });
});

describe("reading what was stored", () => {
  test("starts off with every option on when nothing was stored", () => {
    expect(parseScreenshotModeSettings(null)).toEqual(DEFAULT_SCREENSHOT_MODE);
  });

  test("reads back what was stored", () => {
    const stored = chooseOption(
      turnOn(DEFAULT_SCREENSHOT_MODE, NOW),
      { option: "blankReaderPages", isChosen: false },
      NOW,
    );

    expect(parseScreenshotModeSettings(JSON.stringify(stored))).toEqual(stored);
  });

  test("starts from the defaults when the stored value isn't JSON", () => {
    expect(parseScreenshotModeSettings("{not json")).toEqual(
      DEFAULT_SCREENSHOT_MODE,
    );
  });

  test("keeps the default for an option stored as something other than true or false", () => {
    const stored = JSON.stringify({
      activity: { kind: "on" },
      options: { showLabel: "no", blankReaderPages: false },
    });

    expect(parseScreenshotModeSettings(stored)).toEqual({
      activity: { kind: "on" },
      options: {
        blankReaderPages: false,
        showLabel: true,
        turnOffAfterAnHour: true,
      },
    });
  });

  test("starts off when the stored deadline isn't a time", () => {
    const stored = JSON.stringify({
      activity: { kind: "onUntil", turnsOffAt: "later" },
      options: DEFAULT_SCREENSHOT_MODE.options,
    });

    expect(parseScreenshotModeSettings(stored).activity).toEqual({
      kind: "off",
    });
  });
});
