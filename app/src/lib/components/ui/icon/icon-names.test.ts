import { expect, test } from "vitest";

import map from "#lib/icons/icon-map.json";
import { ICON_NAMES } from "./icon-names.ts";

test("exports icon names from the shared names list", () => {
  expect(ICON_NAMES.length).toBeGreaterThan(0);
  expect(ICON_NAMES).toContain("library");
  expect(ICON_NAMES).toContain("compass");
  expect(ICON_NAMES).toContain("history");
  expect(ICON_NAMES).toContain("settings");
  expect(ICON_NAMES).toContain("chevron-down");
});

test("maps chevron-down to keyboard_arrow_down for Android Material Symbols", () => {
  expect(map["chevron-down"].material).toBe("keyboard_arrow_down");
});
