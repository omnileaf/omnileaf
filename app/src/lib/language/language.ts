import {
  baseLocale,
  defineCustomClientStrategy,
  extractLocaleFromNavigator,
  getLocale,
  getTextDirection,
  isLocale,
  type Locale,
  locales,
} from "#lib/paraglide/runtime.js";

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
export function useChosenLanguage(
  store: Pick<LanguageStore, "getItem">,
  systemAppLanguage: () => Locale | undefined,
): void {
  defineCustomClientStrategy(CHOSEN_LANGUAGE_STRATEGY, {
    getLocale: () => {
      const choice = storedLanguageChoice(store);
      return choice === "system" ? systemAppLanguage() : choice;
    },
    setLocale: () => undefined,
  });
}

function languageSubtags(tag: string): readonly string[] {
  return tag.toLowerCase().replaceAll("_", "-").split("-");
}

export function supportedLocaleForTag<Supported extends string>(
  tag: string,
  supported: readonly Supported[],
  fallback: Supported,
): Supported {
  const subtags = languageSubtags(tag);
  const lowered = supported.map((locale) => languageSubtags(locale).join("-"));
  for (let length = subtags.length; length > 0; length -= 1) {
    const found = lowered.indexOf(subtags.slice(0, length).join("-"));
    if (found !== -1) {
      return supported[found] ?? fallback;
    }
  }
  const sameLanguage = lowered.findIndex(
    (locale) => languageSubtags(locale)[0] === subtags[0],
  );
  return supported[sameLanguage] ?? fallback;
}

export function systemAppLocale(tag: string | null): Locale | undefined {
  return tag === null || tag === ""
    ? undefined
    : supportedLocaleForTag(tag, LANGUAGES, baseLocale);
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
