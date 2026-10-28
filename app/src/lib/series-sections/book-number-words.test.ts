import { expect, test } from "vitest";

import {
  bookWords,
  gapWords,
  missingVolumeCount,
  missingVolumeNumbers,
  type NumberedBook,
  volumeWords,
} from "./book-number-words";

function numbered(shape: Partial<NumberedBook>): NumberedBook {
  return {
    kind: null,
    numbers: null,
    volume: null,
    title: "Sample Series 04 v03.cbz",
    ...shape,
  };
}

test("names a volume by its number", () => {
  const book = numbered({ kind: "volume", numbers: { first: 3, last: 3 } });

  expect(bookWords(book)).toBe("Volume 3");
});

test("names a volume that spans several by its first and last number", () => {
  const book = numbered({ kind: "volume", numbers: { first: 1, last: 3 } });

  expect(bookWords(book)).toBe("Volumes 1–3");
});

test("names a chapter by its number, decimals kept", () => {
  const book = numbered({
    kind: "chapter",
    numbers: { first: 12.5, last: 12.5 },
  });

  expect(bookWords(book)).toBe("Chapter 12.5");
});

test("names a run of chapters in one file by its first and last number", () => {
  const book = numbered({ kind: "chapter", numbers: { first: 4, last: 6 } });

  expect(bookWords(book)).toBe("Chapters 4–6");
});

test("keeps the title of a special and of a book without numbers", () => {
  const special = numbered({ kind: "special", title: "Summer Short" });
  const unnumbered = numbered({ kind: "chapter", title: "Oneshot" });

  expect([bookWords(special), bookWords(unnumbered)]).toEqual([
    "Summer Short",
    "Oneshot",
  ]);
});

test("says which volume a chapter is read in", () => {
  const book = numbered({
    kind: "chapter",
    numbers: { first: 17, last: 17 },
    volume: 3,
  });

  expect(volumeWords(book)).toBe("In Volume 3");
});

test("says no volume for a chapter outside one or for a volume", () => {
  const loose = numbered({ kind: "chapter", numbers: { first: 99, last: 99 } });
  const volume = numbered({ kind: "volume", numbers: { first: 2, last: 2 } });

  expect([volumeWords(loose), volumeWords(volume)]).toEqual([
    undefined,
    undefined,
  ]);
});

test("names a missing run of two one by one in the gap label", () => {
  expect(gapWords({ first: 5, last: 6 })).toEqual({
    title: "Volumes 5–6",
    label: "Volumes 5 and 6 are not in the folder",
  });
});

test("names a longer missing run by its ends in the gap label", () => {
  expect(gapWords({ first: 5, last: 8 })).toEqual({
    title: "Volumes 5–8",
    label: "Volumes 5–8 are not in the folder",
  });
});

test("names one missing volume on its own", () => {
  expect(gapWords({ first: 8, last: 8 })).toEqual({
    title: "Volume 8",
    label: "Volume 8 is not in the folder",
  });
});

test("counts every volume across the missing runs", () => {
  expect(
    missingVolumeCount([
      { first: 5, last: 6 },
      { first: 9, last: 9 },
    ]),
  ).toBe(3);
});

test("lists two missing volumes in a row one by one", () => {
  expect(missingVolumeNumbers([{ first: 5, last: 6 }])).toBe("5 and 6");
});

test("names a longer run of missing volumes by its ends", () => {
  expect(missingVolumeNumbers([{ first: 5, last: 8 }])).toBe("5–8");
});

test("lists every missing run", () => {
  expect(
    missingVolumeNumbers([
      { first: 2, last: 2 },
      { first: 5, last: 6 },
      { first: 9, last: 12 },
    ]),
  ).toBe("2, 5, 6, and 9–12");
});
