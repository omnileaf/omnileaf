import { expect, test } from "vitest";

import { type NotedSeries, sectionNote } from "./section-note";

const WITH_GAPS: NotedSeries = {
  sections: ["volumes", "chapters", "specials"],
  missingVolumes: [{ first: 5, last: 6 }],
  lastVolume: 12,
};

test("names the missing volumes and says what their gap does", () => {
  expect(sectionNote("volumes", WITH_GAPS)).toBe(
    "Volumes 5 and 6 aren’t in the folder. The gap keeps the others in place.",
  );
});

test("names one missing volume on its own", () => {
  const series = { ...WITH_GAPS, missingVolumes: [{ first: 8, last: 8 }] };

  expect(sectionNote("volumes", series)).toBe(
    "Volume 8 isn’t in the folder. The gap keeps the others in place.",
  );
});

test("speaks of gaps when the missing volumes fall in several places", () => {
  const series = {
    ...WITH_GAPS,
    missingVolumes: [
      { first: 2, last: 2 },
      { first: 5, last: 6 },
    ],
  };

  expect(sectionNote("volumes", series)).toBe(
    "Volumes 2, 5, and 6 aren’t in the folder. The gaps keep the others in place.",
  );
});

test("says nothing over volumes when none is missing", () => {
  expect(
    sectionNote("volumes", { ...WITH_GAPS, missingVolumes: [] }),
  ).toBeUndefined();
});

test("says which volume the chapters come after", () => {
  expect(sectionNote("chapters", WITH_GAPS)).toBe(
    "The chapters after Volume 12. A chapter that’s already inside a volume is read there.",
  );
});

test("says the chapters come after the last volume when its number is unknown", () => {
  expect(sectionNote("chapters", { ...WITH_GAPS, lastVolume: null })).toBe(
    "The chapters after the last volume. A chapter that’s already inside a volume is read there.",
  );
});

test("says nothing over chapters when the series has no volumes", () => {
  expect(
    sectionNote("chapters", {
      sections: ["chapters"],
      missingVolumes: [],
      lastVolume: null,
    }),
  ).toBeUndefined();
});

test("says where the specials come from", () => {
  expect(sectionNote("specials", WITH_GAPS)).toBe(
    "Extras from the series’ Specials folder, kept apart from the numbered books.",
  );
});
