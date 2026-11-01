import { expect, test } from "vitest";

import { isSectionRoot, sectionOf } from "./sections";

test.each([
  ["/", "library"],
  ["/browse", "browse"],
  ["/history", "history"],
  ["/settings", "settings"],
  ["/settings/about", "settings"],
] as const)("puts %s in the %s section", (pathname, section) => {
  expect(sectionOf(pathname)).toBe(section);
});

test("puts an unknown page in the library section", () => {
  expect(sectionOf("/somewhere-else")).toBe("library");
});

test.each([
  "/(app)",
  "/(app)/browse",
  "/(app)/history",
  "/(app)/settings",
] as const)("takes %s for the first page of a section", (routeId) => {
  expect(isSectionRoot(routeId)).toBe(true);
});

test.each([
  "/(app)/search",
  "/(app)/series/[id]",
  "/(app)/creator/[name]",
  "/(app)/settings/about",
  null,
] as const)("takes %s for a page inside a section", (routeId) => {
  expect(isSectionRoot(routeId)).toBe(false);
});
