import { createContext } from "svelte";

import {
  browserStorage,
  type PreferenceStore,
  readPreference,
  rememberPreference,
} from "$lib/preferences/preference-store";

import {
  parseThemePreference,
  resolveTheme,
  type Theme,
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
  resolved: Theme = $state("light");

  constructor(
    private readonly store: PreferenceStore | undefined,
    private readonly darkMode: DarkModeQuery,
    private readonly root: HTMLElement,
  ) {
    this.preference = parseThemePreference(
      readPreference(store, PREFERENCE_KEY),
    );
    this.apply();
    darkMode.addEventListener("change", () => {
      this.apply();
    });
  }

  choose(preference: ThemePreference): void {
    this.preference = preference;
    this.apply();
    rememberPreference(this.store, PREFERENCE_KEY, preference);
  }

  private apply(): void {
    this.resolved = resolveTheme(this.preference, this.darkMode.matches);
    this.root.dataset.theme = this.resolved;
  }
}

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export function themeSettingForDocument(): ThemeSetting {
  return new ThemeSetting(
    browserStorage(),
    window.matchMedia(DARK_MODE_QUERY),
    document.documentElement,
  );
}

export const [getThemeSetting, setThemeSetting] = createContext<ThemeSetting>();
