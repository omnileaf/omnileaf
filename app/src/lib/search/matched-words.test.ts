import { expect, test } from "vitest";

import { matchedWords } from "./matched-words";

test("marks each word typed where the title holds it, whatever its case", () => {
  expect(matchedWords("The Harbour Letters", "harbour LET", "en")).toEqual([
    { text: "The ", isMatch: false },
    { text: "Harbour", isMatch: true },
    { text: " ", isMatch: false },
    { text: "Let", isMatch: true },
    { text: "ters", isMatch: false },
  ]);
});

test("marks nothing in a title when nothing was typed", () => {
  expect(matchedWords("Harbour Gate", "  ", "en")).toEqual([
    { text: "Harbour Gate", isMatch: false },
  ]);
});

test("marks a word typed twice where the title holds it twice", () => {
  expect(matchedWords("Gate to Gate", "gate", "en")).toEqual([
    { text: "Gate", isMatch: true },
    { text: " to ", isMatch: false },
    { text: "Gate", isMatch: true },
  ]);
});
