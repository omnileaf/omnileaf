import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import type { SeriesBookListing } from "#lib/ipc/bindings.ts";

import { seriesBookList } from "./series-books.svelte";
import type { SeriesId } from "./series-id";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a4" as SeriesId;
const IN_ORDER: SeriesBookListing = { shown: "all", direction: "ascending" };
const UNREAD_LAST_FIRST: SeriesBookListing = {
  shown: "unread",
  direction: "descending",
};

afterEach(() => {
  clearMocks();
});

test("goes on in the listing its list was read from the start in, until it starts again", async () => {
  const asked: { listing: unknown; after: unknown }[] = [];
  mockIPC((_, args) => {
    const { listing, after } = args as { listing: unknown; after: unknown };
    asked.push({ listing, after });
    return { books: [], next: after === null ? "1" : null };
  });
  let listing = IN_ORDER;
  const books = seriesBookList(SERIES, () => listing);
  await books.start();

  listing = UNREAD_LAST_FIRST;
  await books.loadMore();
  await books.start();

  expect(asked).toEqual([
    { listing: IN_ORDER, after: null },
    { listing: IN_ORDER, after: "1" },
    { listing: UNREAD_LAST_FIRST, after: null },
  ]);
});
