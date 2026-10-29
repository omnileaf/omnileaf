import { createContext } from "svelte";

import {
  browserStorage,
  type PreferenceStore,
  readPreference,
  rememberPreference,
} from "#lib/preferences/preference-store.ts";

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
  at(time: number, run: () => void): () => void;
}

export interface ScreenshotModeEngine {
  setOn(isOn: boolean): Promise<void>;
}

export class ScreenshotMode {
  #settings: ScreenshotModeSettings = $state.raw(DEFAULT_SCREENSHOT_MODE);
  #cancelTurningOff: (() => void) | undefined;
  #engineReady: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: PreferenceStore | undefined,
    private readonly clock: Clock,
    private readonly engine: ScreenshotModeEngine,
  ) {
    const stored = parseScreenshotModeSettings(
      readPreference(store, PREFERENCE_KEY),
    );
    this.#apply(settle(stored, clock.now()));
  }

  /** Library reads wait for this, since the engine starts with Screenshot mode off at every launch. */
  get engineReady(): Promise<void> {
    return this.#engineReady;
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
    const wasOn = this.isOn;
    this.#settings = settings;
    if (this.isOn !== wasOn) {
      this.#engineReady = this.engine.setOn(this.isOn).catch(() => undefined);
    }
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

export function screenshotModeForDocument(
  engine: ScreenshotModeEngine,
): ScreenshotMode {
  return new ScreenshotMode(browserStorage(), browserClock, engine);
}

export const [getScreenshotMode, setScreenshotMode] =
  createContext<ScreenshotMode>();
