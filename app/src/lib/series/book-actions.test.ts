import { expect, test } from "vitest";

import { bookActions } from "./book-actions";

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
