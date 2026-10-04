import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "$lib/preferences/stored-preference";

import {
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from "./theme";

const PREFERENCE_KEY = "omnileaf.theme";

export interface DarkModeQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

/** Applies the light or dark choice to `root` as `data-theme`, following the device while the choice is "system". */
export class ThemeSetting {
  preference: ThemePreference = $state("system");

  readonly #stored: StoredPreference;

  constructor(
    store: PreferenceStore | undefined,
    private readonly darkMode: DarkModeQuery,
    private readonly root: HTMLElement,
  ) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.preference = parseThemePreference(this.#stored.read());
    this.apply();
    darkMode.addEventListener("change", () => {
      this.apply();
    });
  }

  choose(preference: ThemePreference): void {
    this.preference = preference;
    this.apply();
    this.#stored.writeIfPossible(preference);
  }

  private apply(): void {
    this.root.dataset.theme = resolveTheme(
      this.preference,
      this.darkMode.matches,
    );
  }
}

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

/** The setting for this document; the choice is kept in the web view's storage until the app has a settings store. */
export function themeSettingForDocument(): ThemeSetting {
  return new ThemeSetting(
    browserPreferenceStore(),
    window.matchMedia(DARK_MODE_QUERY),
    document.documentElement,
  );
}

export const [getThemeSetting, setThemeSetting] = createContext<ThemeSetting>();
