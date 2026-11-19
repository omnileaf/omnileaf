import { expect, test } from "vitest";

import type { SeriesBook } from "#lib/ipc/bindings.ts";

import { book, chapter } from "./book-fixture.ts";
import { partlyConnectedWording } from "./partly-connected";

function volume(number: number): SeriesBook {
  return {
    ...book(number),
    kind: "volume",
    numbers: { first: number, last: number },
  };
}

function away(shown: SeriesBook): SeriesBook {
  return { ...shown, file: { kind: "notConnected" } };
}

const SIX_THERE = [1, 2, 3, 4, 5, 6].map(volume);

test("names the volumes that aren't connected when all of them are loaded", () => {
  const wording = partlyConnectedWording({
    awayCount: 2,
    bookCount: 8,
    loaded: [...SIX_THERE, away(volume(7)), away(volume(8))],
  });

  expect(wording).toEqual({
    title: "2 of 8 books aren’t connected",
    body: "Volumes 7 and 8 are on a drive that is not there. The other 6 open as usual. Your reading progress is safe.",
  });
});

test("names one book that isn't connected by its own words", () => {
  const wording = partlyConnectedWording({
    awayCount: 1,
    bookCount: 3,
    loaded: [away(chapter(12)), chapter(13), chapter(14)],
  });

  expect(wording).toEqual({
    title: "1 of 3 books isn’t connected",
    body: "Chapter 12 is on a drive that is not there. The other 2 open as usual. Your reading progress is safe.",
  });
});

test("names a mix of books that aren't connected by their own words", () => {
  const wording = partlyConnectedWording({
    awayCount: 2,
    bookCount: 3,
    loaded: [away(volume(1)), away(chapter(12)), volume(2)],
  });

  expect(wording.body).toBe(
    "Volume 1 and Chapter 12 are on a drive that is not there. The other book opens as usual. Your reading progress is safe.",
  );
});

test("names none when more than three books aren't connected", () => {
  const wording = partlyConnectedWording({
    awayCount: 4,
    bookCount: 8,
    loaded: [...SIX_THERE.slice(0, 4), ...[5, 6, 7, 8].map(volume).map(away)],
  });

  expect(wording.body).toBe(
    "They’re on a drive that is not there. The other 4 open as usual. Your reading progress is safe.",
  );
});

test("names none while some books that aren't connected aren't loaded", () => {
  const wording = partlyConnectedWording({
    awayCount: 2,
    bookCount: 8,
    loaded: [...SIX_THERE, away(volume(7))],
  });

  expect(wording.body).toBe(
    "They’re on a drive that is not there. The other 6 open as usual. Your reading progress is safe.",
  );
});
