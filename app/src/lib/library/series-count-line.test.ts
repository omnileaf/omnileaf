import { expect, test } from "vitest";

import { DEFAULT_LIBRARY_VIEW, type OnCovers } from "#lib/ipc/bindings.ts";

import {
  countsVolumesAndChapters,
  seriesCountLine,
  showsCountUnderCover,
} from "./series-count-line";

function counted(bookCount: number, volumeCount: number, chapterCount: number) {
  return { bookCount, volumeCount, chapterCount };
}

test("counts the volumes and chapters of a series on android", () => {
  const lines = [
    counted(18, 12, 6),
    counted(12, 12, 0),
    counted(142, 0, 142),
    counted(2, 1, 1),
    counted(3, 0, 3),
  ].map((series) => seriesCountLine(series, "android"));

  expect(lines).toEqual([
    "12 volumes · 6 chapters",
    "12 volumes",
    "142 chapters",
    "1 volume · 1 chapter",
    "3 chapters",
  ]);
});

test("leaves the specials and unnumbered books out once a series has volumes or chapters on android", () => {
  const line = seriesCountLine(counted(15, 12, 0), "android");

  expect(line).toBe("12 volumes");
});

test("says a series of one book that isn't a volume is a one-shot on android", () => {
  const lines = [counted(1, 0, 1), counted(1, 0, 0), counted(1, 1, 0)].map(
    (series) => seriesCountLine(series, "android"),
  );

  expect(lines).toEqual(["One-shot", "One-shot", "1 volume"]);
});

test("counts books on android when none of them is numbered as a volume or chapter", () => {
  const line = seriesCountLine(counted(5, 0, 0), "android");

  expect(line).toBe("5 books");
});

test("keeps counting books on every other platform", () => {
  const platforms = ["ios", "macos", "windows", "linux"] as const;

  const lines = platforms.map((platform) =>
    seriesCountLine(counted(18, 12, 6), platform),
  );

  expect(lines).toEqual(["18 books", "18 books", "18 books", "18 books"]);
});

function withCounts(showsVolumeAndChapterCounts: boolean): OnCovers {
  return { ...DEFAULT_LIBRARY_VIEW.onCovers, showsVolumeAndChapterCounts };
}

test("counts volumes and chapters only on android", () => {
  const platforms = ["android", "ios", "macos", "windows", "linux"] as const;

  const counting = platforms.filter(countsVolumesAndChapters);

  expect(counting).toEqual(["android"]);
});

test("draws no count under a cover on android until the volume and chapter counts are on", () => {
  const drawn = [false, true].map((isOn) =>
    showsCountUnderCover("android", withCounts(isOn)),
  );

  expect(drawn).toEqual([false, true]);
});

test("keeps drawing the book count under a cover on every other platform whatever the option says", () => {
  const platforms = ["ios", "macos", "windows", "linux"] as const;

  const drawn = platforms.flatMap((platform) =>
    [false, true].map((isOn) =>
      showsCountUnderCover(platform, withCounts(isOn)),
    ),
  );

  expect(drawn).toEqual(Array.from({ length: 8 }, () => true));
});
