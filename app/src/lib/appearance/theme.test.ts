import { expect, test } from "vitest";

import { parseThemePreference, resolveTheme, systemBarsTheme } from "./theme";

test.each([
  ["system", false, "light"],
  ["system", true, "dark"],
  ["light", true, "light"],
  ["dark", false, "dark"],
] as const)(
  "resolves %s with a dark system %s to %s",
  (preference, systemIsDark, theme) => {
    expect(resolveTheme(preference, systemIsDark)).toBe(theme);
  },
);

test.each(["system", "light", "dark"] as const)(
  "reads back a stored %s preference",
  (preference) => {
    expect(parseThemePreference(preference)).toBe(preference);
  },
);

test.each([null, "", "sepia"])(
  "falls back to the system for a stored %s",
  (stored) => {
    expect(parseThemePreference(stored)).toBe("system");
  },
);

test.each([
  ["light", false, "light"],
  ["dark", false, "dark"],
  ["light", true, "dark"],
  ["dark", true, "dark"],
] as const)(
  "draws the system bars for a %s theme with a book open %s as %s",
  (theme, isBookOpen, barsTheme) => {
    expect(systemBarsTheme(theme, isBookOpen)).toBe(barsTheme);
  },
);
