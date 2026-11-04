import { expect, test, vi } from "vitest";

import {
  adoptsUrlAfter,
  focusPageHeading,
  movesFocusToHeading,
  navSection,
  type HeadingRoot,
  type NavigationType,
} from "#lib/navigation.ts";

test.each([
  ["/admin", "dashboard"],
  ["/admin/", "dashboard"],
  ["/admin/reports", "reports"],
  ["/admin/reports/", "reports"],
  ["/admin/reports/R-1111-1111", "reports"],
] as const)("puts %s in the %s section", (pathname, section) => {
  expect(navSection(pathname)).toBe(section);
});

test.each([
  "/admin/login",
  "/admin/reports2",
  "/administrator",
  "/adminreports",
  "/reports",
  "/",
])("puts %s in no section", (pathname) => {
  expect(navSection(pathname)).toBeUndefined();
});

test.each([
  ["link", true],
  ["popstate", true],
  ["enter", false],
  ["goto", false],
  ["form", false],
] as const satisfies readonly (readonly [NavigationType, boolean])[])(
  "on a %s navigation moving focus to the heading is %s",
  (type, moves) => {
    expect(movesFocusToHeading(type)).toBe(moves);
  },
);

test("focuses the heading of the page content", () => {
  const focus = vi.fn();
  const querySelector = vi.fn<HeadingRoot["querySelector"]>(() => ({ focus }));

  focusPageHeading({ querySelector });

  expect(querySelector).toHaveBeenCalledWith("main h1");
  expect(focus).toHaveBeenCalledOnce();
});

test("leaves focus alone on a page without a heading", () => {
  expect(() => {
    focusPageHeading({ querySelector: () => null });
  }).not.toThrow();
});

test.each([
  ["enter", true],
  ["link", true],
  ["popstate", true],
  ["form", true],
  ["goto", false],
] as const satisfies readonly (readonly [NavigationType, boolean])[])(
  "after a %s navigation reading the filter from the address is %s",
  (type, adopts) => {
    expect(adoptsUrlAfter(type)).toBe(adopts);
  },
);
