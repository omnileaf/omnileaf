import { expect, test } from "vitest";

import { chipsThatFit } from "./filter-chips";

const GAP = 8;
const MORE = 40;

test("keeps every chip when they all fit, gaps included", () => {
  expect(
    chipsThatFit({ widths: [100, 100], gap: GAP, available: 208, more: MORE }),
  ).toBe(2);
});

test("leaves room for +N once the chips overflow", () => {
  expect(
    chipsThatFit({
      widths: [100, 100, 100],
      gap: GAP,
      available: 250,
      more: MORE,
    }),
  ).toBe(1);
});

test("folds every chip into +N when not even the first fits beside it", () => {
  expect(
    chipsThatFit({ widths: [300, 100], gap: GAP, available: 200, more: MORE }),
  ).toBe(0);
});
