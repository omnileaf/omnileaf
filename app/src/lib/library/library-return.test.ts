import { expect, test, vi } from "vitest";

import { DEFAULT_LIBRARY_VIEW } from "#lib/ipc/bindings.ts";
import { shownListing } from "#lib/screenshot-mode/shown-listing.ts";

import { NEW_ADULT_CONTENT } from "./adult-content";
import { type LibraryScreen, LibraryReturn } from "./library-return";
import { NEW_LIBRARY_LISTING, NO_FILTER_CHOICES } from "./library-listing";
import { NEW_LIBRARY_TABS } from "./library-tabs";

function screenDrawn(usesStandIns: boolean): LibraryScreen {
  return {
    listing: NEW_LIBRARY_LISTING,
    view: DEFAULT_LIBRARY_VIEW,
    adultContent: NEW_ADULT_CONTENT,
    categories: [],
    tabs: NEW_LIBRARY_TABS,
    filterChoices: NO_FILTER_CHOICES,
    folders: [],
    writers: [],
    missingFolders: [],
    hiddenSeries: 0,
    keepsLabels: false,
    keepsDetailEdits: false,
    pages: {
      basis: shownListing(NEW_LIBRARY_LISTING, usesStandIns),
      chosen: "all",
      pages: [],
      scroll: new Map(),
    },
    unfilteredCounts: {},
    groups: [],
    continueRow: undefined,
  };
}

test("gives back the Library as it was left", () => {
  const library = new LibraryReturn();
  const left = screenDrawn(false);

  library.keep(left);

  expect(library.screenFor(false)).toBe(left);
});

test("gives back nothing drawn with stand-ins once they are off, nor the other way round", () => {
  const withStandIns = new LibraryReturn();
  const withoutStandIns = new LibraryReturn();
  withStandIns.keep(screenDrawn(true));
  withoutStandIns.keep(screenDrawn(false));

  expect([
    withStandIns.screenFor(false),
    withoutStandIns.screenFor(true),
  ]).toEqual([undefined, undefined]);
});

test("forgets the Library before a change that replaces what it holds", () => {
  const library = new LibraryReturn();
  library.keep(screenDrawn(false));
  const change = vi.fn(() => "changed");

  const answer = library.forgetting(change)();

  expect([answer, library.screenFor(false)]).toEqual(["changed", undefined]);
});
