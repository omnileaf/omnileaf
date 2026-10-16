import { expect, test } from "vitest";

import type { LibraryListing } from "#lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";

import { shownListing } from "./shown-listing";

const ONLY_ADULT: LibraryListing = {
  ...NEW_LIBRARY_LISTING,
  filter: { ...NEW_LIBRARY_LISTING.filter, adult: "only", unread: "only" },
};

test("lists the library as chosen while Screenshot mode is off", () => {
  expect(shownListing(ONLY_ADULT, false)).toEqual(ONLY_ADULT);
});

test("leaves 18+ out while Screenshot mode is on, whatever the filter asked", () => {
  expect(shownListing(ONLY_ADULT, true)).toEqual({
    ...ONLY_ADULT,
    filter: { ...ONLY_ADULT.filter, adult: "hide" },
  });
});
