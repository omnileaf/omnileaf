import { expect, test } from "vitest";

import { isWithinSection, sectionCurrent } from "./sections";

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

test("marks a section as the current page on its own page", () => {
  expect(sectionCurrent("/settings/general", "/settings/general")).toBe("page");
});

test("marks a section as current, not the page, on a page under it", () => {
  expect(
    sectionCurrent("/settings/general/language", "/settings/general"),
  ).toBe("true");
});

test("leaves another section unmarked", () => {
  expect(
    sectionCurrent("/settings/about", "/settings/general"),
  ).toBeUndefined();
});
