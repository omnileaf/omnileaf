import { expect, test } from "vitest";

import {
  isListedBeside,
  isWithinSection,
  sectionCurrent,
  settingsGroups,
} from "./sections";

function routesIn(isDevelopmentBuild: boolean): string[][] {
  return settingsGroups({ isDevelopmentBuild }).map((group) =>
    group.map((section) => section.route),
  );
}

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
  const listed = ["/settings", "/settings/general", "/settings/about"] as const;

  expect(listed.map(isListedBeside)).toEqual([true, true, true]);
});

test("leaves a page under a section out of the list beside it", () => {
  expect(isListedBeside("/settings/about/licences")).toBe(false);
});

test("lists Advanced just above About in a development build", () => {
  const groups = routesIn(true);

  expect(groups.at(-1)).toEqual(["/settings/advanced", "/settings/about"]);
});

test("leaves Advanced out of a release build entirely", () => {
  const groups = routesIn(false);

  expect(groups.flat()).not.toContain("/settings/advanced");
  expect(groups.at(-1)).toEqual(["/settings/about"]);
});

test("lists Advanced beside the open page", () => {
  expect(isListedBeside("/settings/advanced")).toBe(true);
});
