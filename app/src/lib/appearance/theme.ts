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
