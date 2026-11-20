import { expect, test } from "vitest";

import type { ResolvedPathname } from "$app/types";

import { originAfter, readerWayBack } from "./reader-way-back";

const HISTORY = {
  pathname: "/history",
  href: "/history" as ResolvedPathname,
};
const SERIES = {
  href: "/series/a1",
  title: "Sample Series 04",
  isInLibrary: true,
};

test("remembers the page the reader was opened from", () => {
  expect(originAfter(undefined, { kind: "fromPage", page: HISTORY })).toBe(
    HISTORY,
  );
});

test("keeps the page the reader was opened from when it moves on to another book", () => {
  expect(originAfter(HISTORY, { kind: "fromReader" })).toBe(HISTORY);
});

test("has no page to return to when the app opens straight into the reader", () => {
  expect(originAfter(HISTORY, { kind: "enter" })).toBeUndefined();
});

test("goes back to the series page it was opened from, named by its series", () => {
  expect(readerWayBack("/series/a1", true, SERIES)).toEqual({
    kind: "history",
    path: "/series/a1",
    label: "Back to Sample Series 04",
  });
});

test("goes back to the library it was opened from", () => {
  expect(readerWayBack("/", true, SERIES)).toEqual({
    kind: "history",
    path: "/",
    label: "Back to the library",
  });
});

test("goes back to History it was opened from", () => {
  expect(readerWayBack("/history", true, SERIES)).toEqual({
    kind: "history",
    path: "/history",
    label: "Back to History",
  });
});

test("says only Back for a page it has no name for", () => {
  expect(readerWayBack("/search", true, SERIES)).toEqual({
    kind: "history",
    path: "/search",
    label: "Back",
  });
});

test("puts the series page in its place when there is nothing to go back to", () => {
  expect(readerWayBack(undefined, false, SERIES)).toEqual({
    kind: "replace",
    path: "/series/a1",
    label: "Back to Sample Series 04",
  });
});

test("puts the library in its place for a book outside the library", () => {
  expect(
    readerWayBack(undefined, false, {
      href: "/",
      title: "",
      isInLibrary: false,
    }),
  ).toEqual({ kind: "replace", path: "/", label: "Back to the library" });
});

test("puts the series page in its place when the page it came from is gone from history", () => {
  expect(readerWayBack("/history", false, SERIES)).toEqual({
    kind: "replace",
    path: "/series/a1",
    label: "Back to Sample Series 04",
  });
});
