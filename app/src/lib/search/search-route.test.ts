import { expect, test } from "vitest";

import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";

import { searchAskedIn, searchQuery, titleQuery } from "./search-route";

function searchPage(query: string): URL {
  return new URL(`/search${query}`, "http://localhost");
}

test("reads text someone typed apart from a title chosen elsewhere", () => {
  const asked = [
    searchAskedIn(searchPage(searchQuery("unread lantern"))),
    searchAskedIn(searchPage(titleQuery("Finished Business"))),
    searchAskedIn(searchPage("")),
  ];

  expect(asked).toEqual([
    { kind: "typed", text: "unread lantern" },
    { kind: "title", text: "Finished Business" },
    { kind: "typed", text: "" },
  ]);
});

test("cuts what it is asked to find to the characters a search reads, not the code units", () => {
  const longest = "🏮".repeat(SEARCH_MAX_CHARS);

  const asked = [
    searchAskedIn(searchPage(titleQuery(`${longest}🏮`))),
    searchAskedIn(searchPage(searchQuery(`${longest}🏮`))),
  ];

  expect(asked.map(({ text }) => text)).toEqual([longest, longest]);
});
