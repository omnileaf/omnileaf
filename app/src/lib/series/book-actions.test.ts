import { expect, test } from "vitest";

import { bookActions, hasRowDelete } from "./book-actions";

test("offers to start a book not started and to mark it read", () => {
  expect(bookActions({ state: "notStarted" })).toEqual({
    read: "start",
    mark: "read",
  });
});

test("offers to go on with a book started and to mark it read", () => {
  expect(bookActions({ state: "started", page: 15 })).toEqual({
    read: "continue",
    mark: "read",
  });
});

test("offers to start a read book again and to mark it unread", () => {
  expect(bookActions({ state: "read" })).toEqual({
    read: "start",
    mark: "unread",
  });
});

test.each(["linux", "android", "windows", "macos"] as const)(
  "offers to delete a book from its row on %s",
  (platform) => {
    expect(hasRowDelete(platform)).toBe(true);
  },
);

test("leaves a book's row without Delete on iOS", () => {
  expect(hasRowDelete("ios")).toBe(false);
});
