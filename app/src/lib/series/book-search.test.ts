import { expect, test } from "vitest";

import { booksMatching } from "./book-search";

function book(title: string): { readonly title: string } {
  return { title };
}

const BOOKS = [
  book("The Harbour Gate"),
  book("Low Tide"),
  book("Paper Shades"),
];

test("keeps the books whose titles hold the search, whatever its case", () => {
  expect(booksMatching(BOOKS, "TIDE", "en").map(({ title }) => title)).toEqual([
    "Low Tide",
  ]);
});

test("keeps every book while the search is blank", () => {
  expect(booksMatching(BOOKS, "  ", "en")).toEqual(BOOKS);
});

test("ignores the spaces around a search", () => {
  expect(
    booksMatching(BOOKS, " paper ", "en").map(({ title }) => title),
  ).toEqual(["Paper Shades"]);
});
