import { expect, test } from "vitest";

import { tagIn, tagQuery } from "./tag-link";

test("writes a tag into a query a library link can carry", () => {
  expect(tagQuery("Slice of life")).toBe("?tag=Slice+of+life");
});

test("reads back the tag a link carries, spaces and symbols included", () => {
  const url = new URL(`https://app.test/${tagQuery("Sci-fi & more")}`);

  expect(tagIn(url)).toBe("Sci-fi & more");
});

test("finds no tag in a plain library address", () => {
  expect(tagIn(new URL("https://app.test/"))).toBeUndefined();
});
