import { expect, test } from "vitest";

import type {
  HistoryEntry,
  OpenedBook,
  SeriesBook,
  SeriesOverview,
  SeriesVolume,
} from "#lib/ipc/bindings.ts";
import type { CoverPath } from "#lib/library/cover-url.ts";
import { standInLook } from "#lib/library/series-look.ts";
import { bookIdIn } from "#lib/reader/opened-book.ts";
import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";
import type { SeriesId } from "#lib/series/series-id.ts";
import {
  standInBook,
  standInHistoryEntry,
  standInOpenedBook,
  standInOverview,
  standInVolume,
} from "#lib/series/series-stand-ins.ts";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a1" as SeriesId;

function readEntry(): HistoryEntry {
  const book = bookIdIn("0190a3e4-0000-8000-8000-0000000000b1");
  if (book === undefined) {
    throw new Error("a sample book needs an id's shape");
  }
  return {
    book,
    bookTitle: "Hidden Story v04",
    series: SERIES,
    seriesTitle: "Hidden Story",
    position: 4,
    cover: null,
    startedAtMs: 1_790_000_000_000,
    utcOffsetMinutes: 600,
    readSeconds: 90,
    readTo: { state: "page", page: 7, pageCount: 24 },
    reading: { state: "started", page: 7 },
    day: { day: 20_717, readSeconds: 600 },
  };
}

function seriesBook(position: number): SeriesBook {
  const id = bookIdIn(`0190a3e4-0000-8000-8000-0000000000c${String(position)}`);
  if (id === undefined) {
    throw new Error("a sample book needs an id's shape");
  }
  return {
    id,
    position,
    title: `Hidden Story v0${String(position)}`,
    addedAtMs: 1_790_000_000_000,
    reading: { state: "started", page: 14 },
    pageCount: 192,
    isBookmarked: false,
    isNew: false,
    file: { kind: "present" },
    kind: null,
    numbers: null,
    volume: null,
    section: null,
    cover: null,
  };
}

function overview(): SeriesOverview {
  return {
    id: SERIES,
    title: "Hidden Story",
    bookCount: 8,
    readCount: 2,
    bookmarkCount: 0,
    connection: { kind: "connected" },
    cover: null,
    folder: null,
    upNext: seriesBook(3),
    format: "Manga",
    creators: [
      { name: "Author A", role: "storyAndArt", seriesCount: 1 },
      { name: "Author B", role: "story", seriesCount: 1 },
      { name: "Author C", role: "art", seriesCount: 1 },
      { name: "Author D", role: null, seriesCount: 1 },
    ],
    summary: "A lighthouse keeper writes letters home.",
    tags: ["Sea"],
    related: [],
    secondsLeft: null,
    year: null,
    sections: [],
    missingVolumes: [],
    lastVolume: null,
  };
}

test("names a series page's book by its place in the series alone, since the page names the series", () => {
  const book = seriesBook(4);

  const standIn = standInBook(book);

  expect(standIn).toEqual({ ...book, title: "Book 4" });
});

test("names the book to go on with as the book list does", () => {
  const standIn = standInOverview(overview());

  expect(standIn.upNext?.title).toBe("Book 3");
});

test("names a series' creators as writers and artists by what they did", () => {
  const standIn = standInOverview(overview());

  expect(standIn.creators.map(({ name }) => name)).toEqual([
    "Writer 1",
    "Writer 2",
    "Artist 3",
    "Writer 4",
  ]);
});

test("shows a stand-in summary that names nothing of the series", () => {
  const standIn = standInOverview(overview());

  expect(standIn.summary).toBe(
    "A stand-in summary shows here while Screenshot mode is on.",
  );
});

test("names a history entry's series as the library does and its book by its place in the series", () => {
  const entry = readEntry();

  const standIn = standInHistoryEntry(entry);

  const series = standInLook({ id: SERIES, title: "", cover: null }).title;
  expect([standIn.seriesTitle, standIn.bookTitle]).toEqual([
    series,
    `${series} · Book 4`,
  ]);
});

test("keeps where, when and how long a history entry was read", () => {
  const entry = readEntry();

  const standIn = standInHistoryEntry(entry);

  expect({ ...standIn, seriesTitle: "", bookTitle: "" }).toEqual({
    ...entry,
    seriesTitle: "",
    bookTitle: "",
  });
});

test("shows no cover for the books either side of a book opened in Screenshot mode", () => {
  const next = bookIdIn("0190a3e4-0000-8000-8000-0000000000b2");
  const cover =
    "thumb/v1/0190a3e4-0000-8000-8000-0000000000b2/1/1" as CoverPath;
  if (next === undefined) {
    throw new Error("a sample book needs an id's shape");
  }
  const book: OpenedBook = {
    id: next,
    title: "Hidden Story v04",
    series: SERIES,
    seriesTitle: "Hidden Story",
    pages: [],
    startPage: 0,
    reading: { state: "notStarted" },
    position: 4,
    previous: null,
    next: {
      id: next,
      title: "Hidden Story v05",
      cover,
      reading: { state: "notStarted" },
      pageCount: null,
    },
    readingDirection: null,
    bookmarkedPages: null,
    damage: null,
    secondsPerPage: null,
    isInLibrary: true,
  };

  const standIn = standInOpenedBook(book);

  expect(standIn.next?.cover).toBeNull();
});

test("hides a volume's folder, its cover and the chapter to go on with behind stand-ins", () => {
  const volume: SeriesVolume = {
    volume: 3,
    folder: "Volume 03",
    cover: "thumb/v1/0190a3e4-0000-8000-8000-0000000000b3/1/1" as CoverPath,
    bookCount: 8,
    readCount: 2,
    pageCount: 186,
    upNext: seriesBook(9),
  };

  const standIn = standInVolume(volume);

  expect(standIn).toEqual({
    ...volume,
    folder: folderStandIn("Volume 03"),
    cover: null,
    upNext: { ...seriesBook(9), title: "Book 9" },
  });
});
