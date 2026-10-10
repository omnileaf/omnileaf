import { expect, test } from "vitest";

import {
  isListedBeside,
  isWithinSection,
  sectionCurrent,
  SETTINGS_GROUPS,
} from "./sections";

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

test("lists settings and its sections beside the open page", () => {
  const listed = [
    "/(app)/settings",
    "/(app)/settings/general",
    "/(app)/settings/about",
  ] as const;

  expect(listed.map(isListedBeside)).toEqual([true, true, true]);
});

test("leaves a page under a section out of the list beside it", () => {
  expect(isListedBeside("/(app)/settings/about/licences")).toBe(false);
});

test("lists Advanced just above About", () => {
  const routes = SETTINGS_GROUPS.at(-1)?.map((section) => section.route);

  expect(routes).toEqual(["/(app)/settings/advanced", "/(app)/settings/about"]);
});

test("lists Advanced beside the open page", () => {
  expect(isListedBeside("/(app)/settings/advanced")).toBe(true);
});
