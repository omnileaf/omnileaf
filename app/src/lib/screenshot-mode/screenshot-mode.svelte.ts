import { createContext } from "svelte";

import {
  browserStorage,
  type PreferenceStore,
  readPreference,
  rememberPreference,
} from "$lib/preferences/preference-store";

import {
  chooseOption,
  DEFAULT_SCREENSHOT_MODE,
  type OptionChoice,
  parseScreenshotModeSettings,
  type ScreenshotModeActivity,
  type ScreenshotModeOptions,
  type ScreenshotModeSettings,
  settle,
  turnOff,
  turnOn,
} from "./screenshot-mode";

const PREFERENCE_KEY = "omnileaf.screenshotMode";

export interface Clock {
  now(): number;
  /** Runs `run` once `time` comes, unless the returned function cancels it first. */
  at(time: number, run: () => void): () => void;
}

export class ScreenshotMode {
  #settings: ScreenshotModeSettings = $state.raw(DEFAULT_SCREENSHOT_MODE);
  #cancelTurningOff: (() => void) | undefined;

  constructor(
    private readonly store: PreferenceStore | undefined,
    private readonly clock: Clock,
  ) {
    const stored = parseScreenshotModeSettings(
      readPreference(store, PREFERENCE_KEY),
    );
    this.#apply(settle(stored, clock.now()));
  }

  get activity(): ScreenshotModeActivity {
    return this.#settings.activity;
  }

  get options(): ScreenshotModeOptions {
    return this.#settings.options;
  }

  get isOn(): boolean {
    return this.#settings.activity.kind !== "off";
  }

  get showsLabel(): boolean {
    return this.isOn && this.#settings.options.showLabel;
  }

  toggle(): void {
    this.#apply(
      this.isOn
        ? turnOff(this.#settings)
        : turnOn(this.#settings, this.clock.now()),
    );
  }

  choose(choice: OptionChoice): void {
    this.#apply(chooseOption(this.#settings, choice, this.clock.now()));
  }

  /** Timers pause while the device sleeps, so this catches up with the wall clock when the app comes back. */
  settle(): void {
    this.#apply(settle(this.#settings, this.clock.now()));
  }

  #apply(settings: ScreenshotModeSettings): void {
    this.#settings = settings;
    rememberPreference(this.store, PREFERENCE_KEY, JSON.stringify(settings));
    this.#scheduleTurningOff(settings.activity);
  }

  #scheduleTurningOff(activity: ScreenshotModeActivity): void {
    this.#cancelTurningOff?.();
    this.#cancelTurningOff =
      activity.kind === "onUntil"
        ? this.clock.at(activity.turnsOffAt, () => {
            this.settle();
          })
        : undefined;
  }
}

const browserClock: Clock = {
  now: () => Date.now(),
  at: (time, run) => {
    const timer = setTimeout(run, Math.max(0, time - Date.now()));
    return () => {
      clearTimeout(timer);
    };
  },
};

export function screenshotModeForDocument(): ScreenshotMode {
  return new ScreenshotMode(browserStorage(), browserClock);
}

export const [getScreenshotMode, setScreenshotMode] =
  createContext<ScreenshotMode>();
