import { expect, test } from "vitest";

import { tabWords } from "./section-names";

test("shows a section's name with how many books it holds", () => {
  expect(tabWords({ section: "volumes", bookCount: 12 }).text).toBe(
    "Volumes 12",
  );
});

test("reads the count out as books", () => {
  expect(tabWords({ section: "chapters", bookCount: 6 }).label).toBe(
    "Chapters, 6 books",
  );
});

test("reads a section of one book as one book", () => {
  expect(tabWords({ section: "specials", bookCount: 1 }).label).toBe(
    "Specials, 1 book",
  );
});
