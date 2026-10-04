import {
  baseLocale,
  defineCustomClientStrategy,
  extractLocaleFromNavigator,
  getLocale,
  getTextDirection,
  isLocale,
  type Locale,
  locales,
} from "$lib/paraglide/runtime.js";

import { PSEUDO_LOCALE } from "./pseudo-locale";

const LANGUAGE_KEY = "omnileaf.language";
const CHOSEN_LANGUAGE_STRATEGY = "custom-chosen";

export type LanguageChoice = "system" | Locale;

export interface LanguageStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LANGUAGES: readonly Locale[] = locales.filter(
  (locale) => locale !== PSEUDO_LOCALE,
);

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = [
  "system",
  ...LANGUAGES,
];

export function storedLanguageChoice(
  store: Pick<LanguageStore, "getItem">,
): LanguageChoice {
  const stored = store.getItem(LANGUAGE_KEY);
  return stored !== null && isLocale(stored) ? stored : "system";
}

export function rememberLanguageChoice(
  choice: LanguageChoice,
  store: LanguageStore,
): void {
  if (choice === "system") {
    store.removeItem(LANGUAGE_KEY);
  } else {
    store.setItem(LANGUAGE_KEY, choice);
  }
}

/** Paraglide saves the first language it resolves; ignoring that save keeps "system" following the device. */
export function useChosenLanguage(store: Pick<LanguageStore, "getItem">): void {
  defineCustomClientStrategy(CHOSEN_LANGUAGE_STRATEGY, {
    getLocale: () => {
      const choice = storedLanguageChoice(store);
      return choice === "system" ? undefined : choice;
    },
    setLocale: () => undefined,
  });
}

export function markLanguage(root: HTMLElement): void {
  root.lang = getLocale();
  root.dir = getTextDirection();
}

export function systemLanguage(): Locale {
  return extractLocaleFromNavigator() ?? baseLocale;
}

export function languageName(locale: Locale): string {
  return (
    new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
  );
}

const NO_STORE: LanguageStore = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function browserLanguageStore(): LanguageStore {
  try {
    return window.localStorage;
  } catch {
    return NO_STORE;
  }
}
