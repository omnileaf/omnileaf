import { expect, test } from "vitest";

import {
  changedWording,
  fileValuesWording,
  personLabel,
  removePersonLabel,
} from "./detail-wording.ts";

test("names a person by what they did", () => {
  const story = { name: "Author A", role: "story" } as const;

  expect([personLabel(story), removePersonLabel(story)]).toEqual([
    "Story · Author A",
    "Remove Story · Author A",
  ]);
});

test("names a person the files give no role by name alone", () => {
  const unsaid = { name: "Author B", role: null };

  expect([personLabel(unsaid), removePersonLabel(unsaid)]).toEqual([
    "Author B",
    "Remove Author B",
  ]);
});

test("lists the file's values one after another", () => {
  expect(fileValuesWording(["Seinen", "Sea"])).toBe(
    "From the file: Seinen, Sea",
  );
});

test("says what changed in one line", () => {
  expect([
    changedWording(["title"]),
    changedWording(["title", "tags"]),
    changedWording(["people", "summary", "adultMark"]),
  ]).toEqual([
    "Title changed",
    "Title and tags changed",
    "People, summary, and the 18+ mark changed",
  ]);
});
