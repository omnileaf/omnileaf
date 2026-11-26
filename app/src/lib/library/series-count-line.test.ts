import { expect, test } from "vitest";

import { seriesCountLine } from "./series-count-line";

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
