import { expect, test } from "vitest";

import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";

import { SearchQuery } from "./search-query.svelte";

const ENGLISH = { unread: "unread", started: "started", finished: "finished" };

function englishQuery(): SearchQuery {
  return new SearchQuery(ENGLISH, "en");
}

test("searches every series by the text typed when no condition is chosen", () => {
  const query = englishQuery();

  query.type("lantern");

  expect(query.search).toEqual({
    text: "lantern",
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "any",
      finished: "any",
    },
  });
});

test("searches only the series meeting each condition a filter word named", () => {
  const query = englishQuery();

  query.type("unread lantern");

  expect(query.search).toEqual({
    text: "lantern",
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "only",
      started: "any",
      finished: "any",
    },
  });
});

test("keeps the conditions typed earlier as more are typed", () => {
  const query = englishQuery();
  query.type("unread ");

  query.type("started ");

  expect(query.conditions).toEqual(["unread", "started"]);
});

test("chooses a condition, and drops it when it is chosen again", () => {
  const query = englishQuery();

  query.toggle("finished");
  const chosen = query.conditions;
  query.toggle("finished");

  expect([chosen, query.conditions]).toEqual([["finished"], []]);
});

test("has nothing to search for until text or a condition is in it", () => {
  const query = englishQuery();
  query.type("   ");
  const blank = query.isEmpty;

  query.toggle("unread");

  expect([blank, query.isEmpty]).toEqual([true, false]);
});

test("starts over from typed text, reading its filter words", () => {
  const query = englishQuery();
  query.toggle("started");

  query.startOver("finished lantern");

  expect(query.search).toEqual({
    text: "lantern",
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "any",
      finished: "only",
    },
  });
});

test("narrows the search to one format, and back to everything", () => {
  const query = englishQuery();
  query.type("lantern");

  query.narrowTo("manga");
  const narrowed = query.search.filter.formats;
  query.narrowTo("everything");

  expect([narrowed, query.search.filter.formats]).toEqual([["manga"], []]);
});
