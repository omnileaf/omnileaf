import { expect, test } from "vitest";

import { columnsThatFit } from "./segment-columns";

const GAP = 4;

test("keeps every segment on one row while their own widths fit", () => {
  const widths = [60, 100, 90, 60];

  expect(columnsThatFit({ widths, space: 322, gap: GAP })).toBe(4);
});

test("keeps one row with unequal widths even where equal widths would not fit", () => {
  const widths = [60, 100, 90, 60];

  expect(columnsThatFit({ widths, space: 330, gap: GAP })).toBe(4);
});

test("splits four segments two by two once one row is too narrow", () => {
  const widths = [60, 100, 90, 60];

  expect(columnsThatFit({ widths, space: 321, gap: GAP })).toBe(2);
});

test("stacks four segments once two of the widest no longer fit side by side", () => {
  const widths = [60, 100, 90, 60];

  expect(columnsThatFit({ widths, space: 203, gap: GAP })).toBe(1);
});

test("fits two of the widest side by side exactly", () => {
  const widths = [60, 100, 90, 60];

  expect(columnsThatFit({ widths, space: 204, gap: GAP })).toBe(2);
});

test("stacks three segments rather than leave one alone on a second row", () => {
  const widths = [120, 110, 60];

  expect(columnsThatFit({ widths, space: 250, gap: GAP })).toBe(1);
});

test("tries three columns before two for six segments", () => {
  const widths = [50, 50, 50, 50, 50, 50];

  expect(columnsThatFit({ widths, space: 158, gap: GAP })).toBe(3);
});
