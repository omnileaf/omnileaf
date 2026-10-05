import { createContext } from "svelte";

import { baseLocale, getLocale, type Locale } from "$lib/paraglide/runtime.js";

import {
  browserLanguageStore,
  type LanguageChoice,
  type LanguageStore,
  markLanguage,
  rememberLanguageChoice,
  storedLanguageChoice,
  useChosenLanguage,
} from "./language";

/** Shows the chosen interface language in place and marks it on `root`, following the device while the choice is "system". */
export class LanguageSetting {
  choice: LanguageChoice = $state("system");
  resolved: Locale = $state(baseLocale);

  constructor(
    private readonly store: LanguageStore,
    private readonly root: HTMLElement,
  ) {
    useChosenLanguage(store);
    this.choice = storedLanguageChoice(store);
    this.apply();
  }

  choose(choice: LanguageChoice): void {
    rememberLanguageChoice(choice, this.store);
    this.choice = choice;
    this.apply();
  }

  private apply(): void {
    this.resolved = getLocale();
    markLanguage(this.root);
  }
}

export function languageSettingForDocument(): LanguageSetting {
  return new LanguageSetting(browserLanguageStore(), document.documentElement);
}

export const [getLanguageSetting, setLanguageSetting] =
  createContext<LanguageSetting>();
