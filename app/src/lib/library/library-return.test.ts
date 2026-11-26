import { expect, test, vi } from "vitest";

import { DEFAULT_LIBRARY_VIEW } from "#lib/ipc/bindings.ts";
import { shownListing } from "#lib/screenshot-mode/shown-listing.ts";

import { NEW_ADULT_CONTENT } from "./adult-content";
import {
  KeptSections,
  type LibraryScreen,
  LibraryReturn,
} from "./library-return";
import { NEW_LIBRARY_LISTING, NO_FILTER_CHOICES } from "./library-listing";
import { arrangedTabs, NEW_LIBRARY_TABS } from "./library-tabs";

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

const KEPT_GROUP = {
  series: { items: [], next: null },
  count: 3,
};
const KEPT_ROW = { items: [], next: null };

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

test("knows the Library was left once it has been, even with nothing kept", () => {
  const library = new LibraryReturn();
  const before = library.wasLeft;

  library.keep(undefined);

  expect([before, library.wasLeft]).toEqual([false, true]);
});

test("keeps the Library while its tabs stay as they were", () => {
  const library = new LibraryReturn();
  library.keep(screenDrawn(false));

  library.forgetUnlessTabsAre(arrangedTabs(NEW_LIBRARY_TABS, []));

  expect(library.screenFor(false)).toBeDefined();
});

test("forgets the Library once its tabs are arranged differently", () => {
  const library = new LibraryReturn();
  library.keep(screenDrawn(false));

  library.forgetUnlessTabsAre(
    arrangedTabs(
      NEW_LIBRARY_TABS.map((tab) => ({ ...tab, isHidden: true })),
      [],
    ),
  );

  expect(library.screenFor(false)).toBeUndefined();
});

test("gives each kept section to the first that asks for it only", () => {
  const sections = new KeptSections({
    ...screenDrawn(false),
    groups: [{ key: "writer:Author A", group: KEPT_GROUP }],
    continueRow: KEPT_ROW,
  });

  const first = [
    sections.takeGroup("writer:Author A"),
    sections.takeContinueRow(),
  ];
  const again = [
    sections.takeGroup("writer:Author A"),
    sections.takeContinueRow(),
  ];

  expect([first, again]).toEqual([
    [KEPT_GROUP, KEPT_ROW],
    [undefined, undefined],
  ]);
});
