import { expect, test } from "vitest";

import { phrasesOf } from "./chapter-phrases.ts";

test("finds no phrase in text of nothing but white space or under three characters", () => {
  expect([phrasesOf("  "), phrasesOf(" ab "), phrasesOf("éé")]).toEqual([
    null,
    null,
    null,
  ]);
});

test("makes a phrase of its own of each word of three characters or more", () => {
  expect(phrasesOf("gate  harbour")).toEqual(["gate", "harbour"]);
});

test("keeps a short word in the phrase before it", () => {
  expect(phrasesOf("series 4 sample")).toEqual(["series 4", "sample"]);
});

test("keeps a short first word in the phrase after it", () => {
  expect(phrasesOf("2 volume")).toEqual(["2 volume"]);
});

test("keeps short words together until they run to three characters", () => {
  expect(phrasesOf("a b cde")).toEqual(["a b", "cde"]);
});

test("counts characters rather than bytes", () => {
  expect([phrasesOf("ééé"), phrasesOf("é é")]).toEqual([["ééé"], ["é é"]]);
});
