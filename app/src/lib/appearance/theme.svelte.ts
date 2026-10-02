import { createContext } from "svelte";

import {
  parseThemePreference,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from "./theme";

const PREFERENCE_KEY = "omnileaf.theme";

export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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
    this.preference = parseThemePreference(this.readStored());
    this.apply();
    darkMode.addEventListener("change", () => {
      this.apply();
    });
  }

  choose(preference: ThemePreference): void {
    this.preference = preference;
    this.apply();
    this.rememberIfPossible(preference);
  }

  private apply(): void {
    this.resolved = resolveTheme(this.preference, this.darkMode.matches);
    this.root.dataset.theme = this.resolved;
  }

  private rememberIfPossible(preference: ThemePreference): void {
    try {
      this.store?.setItem(PREFERENCE_KEY, preference);
    } catch {
      return;
    }
  }

  private readStored(): string | null {
    try {
      return this.store?.getItem(PREFERENCE_KEY) ?? null;
    } catch {
      return null;
    }
  }
}

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function browserStorage(): PreferenceStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The setting for this document; the choice is kept in the web view's storage until the app has a settings store. */
export function themeSettingForDocument(): ThemeSetting {
  return new ThemeSetting(
    browserStorage(),
    window.matchMedia(DARK_MODE_QUERY),
    document.documentElement,
  );
}

export const [getThemeSetting, setThemeSetting] = createContext<ThemeSetting>();
