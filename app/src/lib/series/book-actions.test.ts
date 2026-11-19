import { expect, test } from "vitest";

import { bookActions, hasRowDelete } from "./book-actions";

test("offers to start a book not started and to mark it read", () => {
  expect(bookActions({ state: "notStarted" })).toMatchObject({
    read: "start",
    mark: "read",
  });
});

test("offers to go on with a book started and to mark it read", () => {
  expect(bookActions({ state: "started", page: 15 })).toMatchObject({
    read: "continue",
    mark: "read",
  });
});

test("offers to start a read book again and to mark it unread", () => {
  expect(bookActions({ state: "read" })).toMatchObject({
    read: "start",
    mark: "unread",
  });
});

test.each([
  { reading: { state: "notStarted" }, marks: ["read"] },
  { reading: { state: "started", page: 15 }, marks: ["read", "unread"] },
  { reading: { state: "read" }, marks: ["unread"] },
] as const)(
  "offers the marks $marks for a book $reading.state",
  ({ reading, marks }) => {
    expect(bookActions(reading).marks).toEqual(marks);
  },
);

test.each(["linux", "android", "windows", "macos"] as const)(
  "offers to delete a book from its row on %s",
  (platform) => {
    expect(hasRowDelete(platform)).toBe(true);
  },
);

test("leaves a book's row without Delete on iOS", () => {
  expect(hasRowDelete("ios")).toBe(false);
});
