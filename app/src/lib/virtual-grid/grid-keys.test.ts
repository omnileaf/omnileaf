import { expect, test } from "vitest";

import { movedTo } from "./grid-keys";

const FOUR_IN_ROWS_OF_THREE = { count: 4, columns: 3 };

test("starts on the first choice from Arrow Down, leaving the other keys to the field's caret until then", () => {
  const moves = ["ArrowDown", "Home", "End", "ArrowUp", "ArrowRight"].map(
    (key) => movedTo(key, undefined, FOUR_IN_ROWS_OF_THREE),
  );

  expect(moves).toEqual([0, undefined, undefined, undefined, undefined]);
});

test("moves along a row with the side arrows and between rows with the up and down arrows", () => {
  const moves = [
    movedTo("ArrowRight", 0, FOUR_IN_ROWS_OF_THREE),
    movedTo("ArrowLeft", 1, FOUR_IN_ROWS_OF_THREE),
    movedTo("ArrowDown", 0, FOUR_IN_ROWS_OF_THREE),
    movedTo("ArrowUp", 3, FOUR_IN_ROWS_OF_THREE),
  ];

  expect(moves).toEqual([1, 0, 3, 0]);
});

test("jumps to the first choice with Home and the last with End", () => {
  const moves = [
    movedTo("Home", 2, FOUR_IN_ROWS_OF_THREE),
    movedTo("End", 1, FOUR_IN_ROWS_OF_THREE),
  ];

  expect(moves).toEqual([0, 3]);
});

test("stays put at an edge rather than wrapping or leaving the grid", () => {
  const moves = [
    movedTo("ArrowLeft", 0, FOUR_IN_ROWS_OF_THREE),
    movedTo("ArrowUp", 1, FOUR_IN_ROWS_OF_THREE),
    movedTo("ArrowDown", 1, FOUR_IN_ROWS_OF_THREE),
    movedTo("ArrowRight", 3, FOUR_IN_ROWS_OF_THREE),
  ];

  expect(moves).toEqual([0, 1, 1, 3]);
});

test("leaves every other key to the field", () => {
  expect(movedTo("a", 2, FOUR_IN_ROWS_OF_THREE)).toBeUndefined();
});
