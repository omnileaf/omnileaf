import { expect, test } from "vitest";

import { textAroundValue } from "./placeholder";

test("splits a message into the words before and after its value", () => {
  expect(
    textAroundValue((language) => `Use the system language (${language})`),
  ).toEqual({
    before: "Use the system language (",
    after: ")",
  });
});

test("keeps the words in the order a translation puts them", () => {
  expect(textAroundValue((language) => `${language} wie das System`)).toEqual({
    before: "",
    after: " wie das System",
  });
});

test("finds nothing to split in a message that leaves its value out", () => {
  expect(textAroundValue(() => "Use the system language")).toBeUndefined();
});

test("finds nothing to split in a message that repeats its value", () => {
  expect(
    textAroundValue((language) => `${language}: use ${language}`),
  ).toBeUndefined();
});
