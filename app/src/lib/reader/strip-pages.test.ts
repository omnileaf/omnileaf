import { expect, test } from "vitest";

import type { BookPage } from "#lib/ipc/bindings.ts";

import { pagesLookLikeStrip } from "./strip-pages";

function pageOf(width: number, height: number): BookPage {
  return {
    path: "pages/1" as BookPage["path"],
    thumbnail: "thumbnails/pages/1" as BookPage["thumbnail"],
    size: { width, height },
  };
}

const UNKNOWN: BookPage = {
  path: "pages/1" as BookPage["path"],
  thumbnail: "thumbnails/pages/1" as BookPage["thumbnail"],
  size: null,
};

test("sees a book of tall pages as a long strip", () => {
  expect(pagesLookLikeStrip([pageOf(800, 2400), pageOf(800, 3000)])).toBe(true);
});

test("sees a book of ordinary pages as paged", () => {
  expect(pagesLookLikeStrip([pageOf(1000, 1500), pageOf(1000, 1500)])).toBe(
    false,
  );
});

test("sees a book with a page wider than tall as paged, since such pages make spreads", () => {
  expect(
    pagesLookLikeStrip([
      pageOf(800, 2400),
      pageOf(2000, 1500),
      pageOf(800, 2400),
    ]),
  ).toBe(false);
});

test("keeps a book a long strip when a short title page opens it", () => {
  expect(
    pagesLookLikeStrip([
      pageOf(800, 1200),
      pageOf(800, 2400),
      pageOf(800, 2400),
      pageOf(800, 2400),
    ]),
  ).toBe(true);
});

test("can't tell from fewer than two pages of known size", () => {
  expect(pagesLookLikeStrip([UNKNOWN, pageOf(800, 2400), UNKNOWN])).toBeNull();
});
