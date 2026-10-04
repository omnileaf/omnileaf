import { expect, test } from "vitest";

import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";

import { searchQuery, searchTextIn } from "./search-route";

function searchPage(query: string): URL {
  return new URL(`/search${query}`, "http://localhost");
}

test("reads the text someone typed from the search page's address", () => {
  const asked = [
    searchTextIn(searchPage(searchQuery("unread lantern"))),
    searchTextIn(searchPage("")),
  ];

  expect(asked).toEqual(["unread lantern", ""]);
});

test("cuts what it is asked to find to the characters a search reads, not the code units", () => {
  const longest = "🏮".repeat(SEARCH_MAX_CHARS);

  const asked = searchTextIn(searchPage(searchQuery(`${longest}🏮`)));

  expect(asked).toBe(longest);
});
