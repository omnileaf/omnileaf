import { createContext } from "svelte";

import type { Platform } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.scheduledRescans";

const IS_ON_BY_DEFAULT = {
  android: false,
  ios: false,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, boolean>;

const STORED_CHOICES = { on: true, off: false } as const;

type StoredChoice = keyof typeof STORED_CHOICES;

function isStoredChoice(value: string): value is StoredChoice {
  return Object.hasOwn(STORED_CHOICES, value);
}

function parseChoice(value: string | null): boolean | undefined {
  return value !== null && isStoredChoice(value)
    ? STORED_CHOICES[value]
    : undefined;
}

/** Whether the app checks the library's folders for new books while it's open, on by default only where a battery matters less. */
export class ScheduledRescansSetting {
  #choice: boolean | undefined = $state();

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.#choice = parseChoice(this.#stored.read());
  }

  isOnFor(platform: Platform): boolean {
    return this.#choice ?? IS_ON_BY_DEFAULT[platform];
  }

  turn(isOn: boolean): void {
    this.#choice = isOn;
    this.#stored.writeIfPossible(isOn ? "on" : "off");
  }
}

export function scheduledRescansSettingForDocument(): ScheduledRescansSetting {
  return new ScheduledRescansSetting(browserPreferenceStore());
}

export const [getScheduledRescansSetting, setScheduledRescansSetting] =
  createContext<ScheduledRescansSetting>();
