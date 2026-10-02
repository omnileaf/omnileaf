import { expect, test } from "vitest";

import { parseThemePreference, resolveTheme } from "./theme";

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
