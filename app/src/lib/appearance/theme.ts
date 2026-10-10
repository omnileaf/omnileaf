export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export function resolveTheme(
  preference: ThemePreference,
  systemIsDark: boolean,
): Theme {
  if (preference === "system") {
    return systemIsDark ? "dark" : "light";
  }
  return preference;
}

export function parseThemePreference(value: string | null): ThemePreference {
  return (
    THEME_PREFERENCES.find((preference) => preference === value) ?? "system"
  );
}

/** The theme the system bars are drawn for: the reader's dark page while a book is open, whatever the app's theme. */
export function systemBarsTheme(theme: Theme, isBookOpen: boolean): Theme {
  return isBookOpen ? "dark" : theme;
}
