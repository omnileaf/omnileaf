import { expect, test } from "vitest";

import type { ResolvedPathname } from "$app/types";

import {
  originOnArrival,
  readerSeriesOf,
  readerWayBack,
  type SeriesPlace,
} from "./reader-way-back";

const HISTORY = {
  pathname: "/history",
  href: "/history" as ResolvedPathname,
};
const LIBRARY = { pathname: "/", href: "/" as ResolvedPathname };
const ANOTHER_BOOK = {
  pathname: "/read/b2",
  href: "/read/b2" as ResolvedPathname,
};
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
  expect(originOnArrival({ kind: "fromPage", page: HISTORY }, undefined)).toBe(
    HISTORY,
  );
});

test("remembers another book as the page the reader was opened from", () => {
  expect(
    originOnArrival({ kind: "fromPage", page: ANOTHER_BOOK }, undefined),
  ).toBe(ANOTHER_BOOK);
});

test("keeps the origin an entry already carries over the page it came from", () => {
  expect(
    originOnArrival({ kind: "fromPage", page: ANOTHER_BOOK }, HISTORY),
  ).toBeUndefined();
});

test("keeps an entry opened from nowhere opened from nowhere", () => {
  expect(
    originOnArrival({ kind: "fromPage", page: ANOTHER_BOOK }, null),
  ).toBeUndefined();
});

test("writes no origin when history returns to the reader", () => {
  expect(originOnArrival({ kind: "returned" }, undefined)).toBeUndefined();
});

test("goes back to the series page it was opened from, named by its series", () => {
  expect(readerWayBack(SERIES_PAGE, SERIES)).toEqual({
    kind: "history",
    href: "/series/a1",
    path: "/series/a1",
    label: "Back to Sample Series 04",
    fallbackHref: "/series/a1",
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
    fallbackHref: "/series/a1",
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
    fallbackHref: "/series/a1",
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
    fallbackHref: "/series/a1",
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
    fallbackHref: "/series/a1",
    genericLabel: "Back to the series",
    isSeries: true,
  });
});

test("puts the library in its place for a book outside the library", () => {
  expect(
    readerWayBack(undefined, {
      href: "/",
      title: "",
      isInLibrary: false,
    }),
  ).toEqual({
    kind: "replace",
    href: "/",
    path: "/",
    label: "Back to the library",
    fallbackHref: "/",
    genericLabel: "Back to the library",
    isSeries: true,
  });
});

const IN_LIBRARY: SeriesPlace = {
  series: "a1" as SeriesPlace["series"],
  seriesTitle: "Sample Series 04",
  isInLibrary: true,
};

test("takes the series page of a book in the library for its series", () => {
  expect(readerSeriesOf(IN_LIBRARY)).toEqual({
    href: "/series/a1",
    title: "Sample Series 04",
    isInLibrary: true,
  });
});

test("takes the library for the series of a book outside it", () => {
  expect(readerSeriesOf({ ...IN_LIBRARY, isInLibrary: false })).toEqual({
    href: "/",
    title: "",
    isInLibrary: false,
  });
});

test("takes the library for the series of a book with no place", () => {
  expect(readerSeriesOf(null)).toEqual({
    href: "/",
    title: "",
    isInLibrary: false,
  });
});
