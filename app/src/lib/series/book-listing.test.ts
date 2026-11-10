import { expect, test } from "vitest";

import { isBooksShown, isSortDirection } from "./book-listing";

test.each(["all", "unread", "bookmarked"])(
  "takes %s as books to show",
  (value) => {
    expect(isBooksShown(value)).toBe(true);
  },
);

test("refuses a word that is not books to show", () => {
  expect(isBooksShown("read")).toBe(false);
});

test.each(["ascending", "descending"])("takes %s as an order", (value) => {
  expect(isSortDirection(value)).toBe(true);
});

test("refuses a word that is not an order", () => {
  expect(isSortDirection("newest")).toBe(false);
});
