import { expect, test } from "vitest";

import { isWithinSection } from "./sections";

test("counts a section's own page as within it", () => {
  expect(isWithinSection("/settings/general", "/settings/general")).toBe(true);
});

test("counts a page under a section as within it", () => {
  expect(
    isWithinSection("/settings/general/language", "/settings/general"),
  ).toBe(true);
});

test("keeps a section whose path only starts the same apart", () => {
  expect(isWithinSection("/settings/generally", "/settings/general")).toBe(
    false,
  );
});

test("keeps another section apart", () => {
  expect(isWithinSection("/settings/about", "/settings/general")).toBe(false);
});
