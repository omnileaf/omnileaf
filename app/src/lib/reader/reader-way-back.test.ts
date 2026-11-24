import { expect, test } from "vitest";

import type { ResolvedPathname } from "$app/types";

import { originOnArrival, readerWayBack } from "./reader-way-back";

const HISTORY = {
  pathname: "/history",
  href: "/history" as ResolvedPathname,
};
const LIBRARY = { pathname: "/", href: "/" as ResolvedPathname };
const SEARCH = {
  pathname: "/search",
  href: "/search?q=sample" as ResolvedPathname,
};
const SERIES_PAGE = {
  pathname: "/series/a1",
  href: "/series/a1" as ResolvedPathname,
};
const SERIES = {
  href: "/series/a1" as ResolvedPathname,
  title: "Sample Series 04",
  isInLibrary: true,
};

test("remembers the page the reader was opened from", () => {
  expect(originOnArrival({ kind: "fromPage", page: HISTORY })).toBe(HISTORY);
});

test("hands the origin of the book it moves on from to the next book", () => {
  expect(originOnArrival({ kind: "fromReader", origin: HISTORY })).toBe(
    HISTORY,
  );
});

test("has no origin to hand on from a book that was opened with none", () => {
  expect(
    originOnArrival({ kind: "fromReader", origin: undefined }),
  ).toBeUndefined();
});

test("writes no origin when history returns to the reader", () => {
  expect(originOnArrival({ kind: "returned" })).toBeUndefined();
});

test("goes back to the series page it was opened from, named by its series", () => {
  expect(readerWayBack(SERIES_PAGE, SERIES)).toEqual({
    kind: "history",
    href: "/series/a1",
    path: "/series/a1",
    label: "Back to Sample Series 04",
    genericLabel: "Back to the series",
    isSeries: true,
  });
});

test("goes back to the library it was opened from", () => {
  expect(readerWayBack(LIBRARY, SERIES)).toEqual({
    kind: "history",
    href: "/",
    path: "/",
    label: "Back to the library",
    genericLabel: "Back to the library",
    isSeries: false,
  });
});

test("goes back to History it was opened from", () => {
  expect(readerWayBack(HISTORY, SERIES)).toEqual({
    kind: "history",
    href: "/history",
    path: "/history",
    label: "Back to History",
    genericLabel: "Back to History",
    isSeries: false,
  });
});

test("keeps the search of the page it was opened from in its link but not in its path", () => {
  expect(readerWayBack(SEARCH, SERIES)).toEqual({
    kind: "history",
    href: "/search?q=sample",
    path: "/search",
    label: "Back",
    genericLabel: "Back",
    isSeries: false,
  });
});

test("puts the series page in its place when there is nothing to go back to", () => {
  expect(readerWayBack(undefined, SERIES)).toEqual({
    kind: "replace",
    href: "/series/a1",
    path: "/series/a1",
    label: "Back to Sample Series 04",
    genericLabel: "Back to the series",
    isSeries: true,
  });
});

test("puts the library in its place for a book outside the library", () => {
  expect(
    readerWayBack(undefined, {
      href: "/" as ResolvedPathname,
      title: "",
      isInLibrary: false,
    }),
  ).toEqual({
    kind: "replace",
    href: "/",
    path: "/",
    label: "Back to the library",
    genericLabel: "Back to the library",
    isSeries: true,
  });
});
