import { expect, test } from "vitest";

import { BookSelection } from "./book-selection.svelte";

const BOOKS = Array.from(
  { length: 6 },
  (_, index) =>
    `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
);

function at(index: number): string {
  const book = BOOKS[index];
  if (book === undefined) {
    throw new Error(`there is no book ${String(index)}`);
  }
  return book;
}

test("starts picking from the book held down, with that book picked", () => {
  const selection = new BookSelection<string>();

  selection.begin(at(2));

  expect([selection.isSelecting, selection.picked]).toEqual([true, [at(2)]]);
});

test("starts picking from the select button with nothing picked", () => {
  const selection = new BookSelection<string>();

  selection.begin();

  expect([selection.isSelecting, selection.count]).toEqual([true, 0]);
});

test("picks a book and leaves it again", () => {
  const selection = new BookSelection<string>();
  selection.begin();

  selection.toggle(at(1));
  const picked = selection.has(at(1));
  selection.toggle(at(1));

  expect([picked, selection.has(at(1))]).toEqual([true, false]);
});

test("picks the books between the one last toggled and the one shift-clicked, either way", () => {
  const selection = new BookSelection<string>();
  selection.begin();
  selection.toggle(at(4));

  selection.extendTo(at(1), BOOKS);

  expect(selection.picked.toSorted()).toEqual([at(1), at(2), at(3), at(4)]);
});

test("picks only the book shift-clicked when none was toggled before", () => {
  const selection = new BookSelection<string>();
  selection.begin();

  selection.extendTo(at(3), BOOKS);

  expect(selection.picked).toEqual([at(3)]);
});

test("keeps picking from the last book toggled after shift-clicking a book no longer listed", () => {
  const selection = new BookSelection<string>();
  selection.begin(at(4));
  selection.extendTo(at(0), BOOKS.slice(1));

  selection.extendTo(at(2), BOOKS.slice(1));

  expect(selection.picked.toSorted()).toEqual([at(2), at(3), at(4)]);
});

test("picks every book listed", () => {
  const selection = new BookSelection<string>();
  selection.begin(at(0));

  selection.pickAll(BOOKS);

  expect(selection.count).toBe(BOOKS.length);
});

test("keeps a picked book a list no longer shows", () => {
  const selection = new BookSelection<string>();
  selection.begin(at(0));
  selection.toggle(at(5));

  expect(selection.picked).toEqual([at(0), at(5)]);
});

test("stops picking with nothing picked", () => {
  const selection = new BookSelection<string>();
  selection.begin(at(0));

  selection.end();

  expect([selection.isSelecting, selection.count]).toEqual([false, 0]);
});
