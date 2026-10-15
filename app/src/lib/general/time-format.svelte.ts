import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.timeFormat";

export const TIME_FORMATS = ["system", "twelveHour", "twentyFourHour"] as const;

export type TimeFormat = (typeof TIME_FORMATS)[number];

const HOUR_CYCLES = {
  system: undefined,
  twelveHour: "h12",
  twentyFourHour: "h23",
} as const satisfies Record<TimeFormat, Intl.LocaleHourCycleKey | undefined>;

function isTimeFormat(stored: string | null): stored is TimeFormat {
  return TIME_FORMATS.some((format) => format === stored);
}

/** Whether times show on the system's clock, or on a 12-hour or 24-hour one. */
export class TimeFormatSetting {
  choice: TimeFormat = $state("system");

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    const stored = this.#stored.read();
    this.choice = isTimeFormat(stored) ? stored : "system";
  }

  get hourCycle(): Intl.LocaleHourCycleKey | undefined {
    return HOUR_CYCLES[this.choice];
  }

  choose(format: TimeFormat): void {
    this.choice = format;
    this.#stored.writeIfPossible(format);
  }
}

export function timeFormatSettingForDocument(): TimeFormatSetting {
  return new TimeFormatSetting(browserPreferenceStore());
}

export const [getTimeFormatSetting, setTimeFormatSetting] =
  createContext<TimeFormatSetting>();
