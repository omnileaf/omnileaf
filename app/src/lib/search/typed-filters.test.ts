import { expect, test } from "vitest";

import { type FilterWords, takeFilterWords } from "./typed-filters";

const ENGLISH: FilterWords = {
  unread: "unread",
  started: "started",
  finished: "finished",
};
const LOCALE = "en";

test("takes a filter word followed by a space out of the text as its condition", () => {
  const typed = takeFilterWords("lantern unread ", ENGLISH, LOCALE);

  expect(typed).toEqual({ text: "lantern ", conditions: ["unread"] });
});

test("leaves a filter word that may still be the start of a longer word", () => {
  const typed = takeFilterWords("lantern unread", ENGLISH, LOCALE);

  expect(typed).toEqual({ text: "lantern unread", conditions: [] });
});

test("reads a filter word whatever its letter case", () => {
  const typed = takeFilterWords("Finished lantern", ENGLISH, LOCALE);

  expect(typed).toEqual({ text: "lantern", conditions: ["finished"] });
});

test("closes the gap a filter word leaves between other words", () => {
  const typed = takeFilterWords("harbour  started gate", ENGLISH, LOCALE);

  expect(typed).toEqual({ text: "harbour  gate", conditions: ["started"] });
});

test("names each condition once however often its word is typed", () => {
  const typed = takeFilterWords("unread started unread x", ENGLISH, LOCALE);

  expect(typed).toEqual({ text: "x", conditions: ["unread", "started"] });
});

test("leaves a word that only starts with a filter word", () => {
  const typed = takeFilterWords("unreadable gate", ENGLISH, LOCALE);

  expect(typed).toEqual({ text: "unreadable gate", conditions: [] });
});
