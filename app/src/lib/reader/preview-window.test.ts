import { expect, test } from "vitest";

import { previewWindow } from "./preview-window";

const REACH = { before: 1, after: 4 };

test("shows one page before the one dragged to and four after it", () => {
  expect(previewWindow(95, 192, REACH)).toEqual({ first: 94, last: 99 });
});

test("starts at the first page near the start of the book", () => {
  expect(previewWindow(0, 192, REACH)).toEqual({ first: 0, last: 5 });
});

test("ends at the last page near the end of the book", () => {
  expect(previewWindow(190, 192, REACH)).toEqual({ first: 186, last: 191 });
});

test("shows every page of a book shorter than the window", () => {
  expect(previewWindow(2, 4, REACH)).toEqual({ first: 0, last: 3 });
});
