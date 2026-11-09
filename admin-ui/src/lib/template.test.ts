import { expect, test } from "vitest";

import { fillTemplate } from "#lib/template.ts";

test("puts each value where its name stands", () => {
  expect(
    fillTemplate("{shown} of {total} reports", { shown: 3, total: "9" }),
  ).toBe("3 of 9 reports");
});

test("fills a name that stands more than once", () => {
  expect(fillTemplate("{n}, {n}", { n: 1 })).toBe("1, 1");
});

test("leaves a text without names as it is", () => {
  expect(fillTemplate("No names here", { n: 1 })).toBe("No names here");
});

test("fails loudly when a name has no value", () => {
  expect(() => fillTemplate("{shown} of {total}", { shown: 1 })).toThrow(
    /total/,
  );
});

test("keeps a zero", () => {
  expect(fillTemplate("{n} left", { n: 0 })).toBe("0 left");
});
