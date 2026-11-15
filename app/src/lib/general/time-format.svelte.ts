import { createContext } from "svelte";

import type { SystemClock } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.timeFormat";

export const TIME_FORMATS = ["system", "twelveHour", "twentyFourHour"] as const;

export type TimeFormat = (typeof TIME_FORMATS)[number];

const CHOSEN_HOUR_CYCLES = {
  twelveHour: "h12",
  twentyFourHour: "h23",
} as const satisfies Record<
  Exclude<TimeFormat, "system">,
  Intl.LocaleHourCycleKey
>;

const CLOCK_HOUR_CYCLES = {
  followsLanguage: undefined,
  ...CHOSEN_HOUR_CYCLES,
} as const satisfies Record<SystemClock, Intl.LocaleHourCycleKey | undefined>;

function languageHourCycle(): Intl.LocaleHourCycleKey | undefined {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
}

function isTwelveHour(cycle: Intl.LocaleHourCycleKey | undefined): boolean {
  return cycle === "h11" || cycle === "h12";
}

function isTimeFormat(stored: string | null): stored is TimeFormat {
  return TIME_FORMATS.some((format) => format === stored);
}

/** Whether times show on the system's clock, or on a 12-hour or 24-hour one. */
export class TimeFormatSetting {
  choice: TimeFormat = $state("system");
  #systemClock: SystemClock = $state("followsLanguage");

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    const stored = this.#stored.read();
    this.choice = isTimeFormat(stored) ? stored : "system";
  }

  get hourCycle(): Intl.LocaleHourCycleKey | undefined {
    return this.choice === "system"
      ? CLOCK_HOUR_CYCLES[this.#systemClock]
      : CHOSEN_HOUR_CYCLES[this.choice];
  }

  get labels(): Record<TimeFormat, string> {
    return {
      system: this.#isSystemTwelveHour()
        ? m.general_time_system_12()
        : m.general_time_system_24(),
      twelveHour: m.general_time_12(),
      twentyFourHour: m.general_time_24(),
    };
  }

  followSystemClock(clock: SystemClock): void {
    this.#systemClock = clock;
  }

  #isSystemTwelveHour(): boolean {
    return isTwelveHour(
      CLOCK_HOUR_CYCLES[this.#systemClock] ?? languageHourCycle(),
    );
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
