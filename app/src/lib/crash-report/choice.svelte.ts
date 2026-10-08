import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const CHOICE_KEY = "omnileaf.crash-reports";

export type CrashReportChoice = "ask" | "always" | "never";

export const CRASH_REPORT_CHOICES: readonly CrashReportChoice[] = [
  "ask",
  "always",
  "never",
];

function parseCrashReportChoice(value: string | null): CrashReportChoice {
  return CRASH_REPORT_CHOICES.find((choice) => choice === value) ?? "ask";
}

/** What happens to a crash report: asked about, sent without asking, or never offered. */
export class CrashReportSetting {
  choice: CrashReportChoice = $state("ask");

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, CHOICE_KEY);
    this.choice = parseCrashReportChoice(this.#stored.read());
  }

  choose(choice: CrashReportChoice): void {
    this.choice = choice;
    this.#stored.writeIfPossible(choice);
  }
}

export function crashReportSettingForDocument(): CrashReportSetting {
  return new CrashReportSetting(browserPreferenceStore());
}

export const [getCrashReportSetting, setCrashReportSetting] =
  createContext<CrashReportSetting>();
