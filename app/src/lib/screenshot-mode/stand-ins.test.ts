import { expect, test } from "vitest";

import { standInName } from "./stand-ins";

test("names a series by its stand-in number, with at least two digits", () => {
  expect(standInName("series", 4)).toBe("Series 04");
});

test("keeps every digit of a larger number", () => {
  expect(standInName("series", 1234)).toBe("Series 1234");
});
