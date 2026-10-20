import { expect, test } from "vitest";

import type { ResolvedPathname } from "$app/types";

import { type IconActionTargets, followIconAction } from "./follow-icon-action";

const LAST_BOOK_PAGE: ResolvedPathname =
  "/read/0190a3e4-0000-8000-8002-000000000001";

interface Followed {
  readonly targets: IconActionTargets;
  readonly opened: string[];
  readonly toggles: () => number;
}

function following(lastBook: ResolvedPathname | undefined): Followed {
  const opened: string[] = [];
  let toggled = 0;
  return {
    targets: {
      toggleScreenshotMode: () => {
        toggled += 1;
        return Promise.resolve();
      },
      lastUnfinishedBookPage: () => Promise.resolve(lastBook),
      open: (page) => {
        opened.push(page);
        return Promise.resolve();
      },
    },
    opened,
    toggles: () => toggled,
  };
}

test("Screenshot mode flips Screenshot mode and stays where the app is", async () => {
  const { targets, opened, toggles } = following(LAST_BOOK_PAGE);

  await followIconAction("screenshotMode", targets);

  expect([toggles(), opened]).toEqual([1, []]);
});

test("Continue reading opens the last unfinished book", async () => {
  const { targets, opened, toggles } = following(LAST_BOOK_PAGE);

  await followIconAction("continueReading", targets);

  expect([toggles(), opened]).toEqual([0, [LAST_BOOK_PAGE]]);
});

test("Continue reading stays put with nothing left unfinished", async () => {
  const { targets, opened } = following(undefined);

  await followIconAction("continueReading", targets);

  expect(opened).toEqual([]);
});

test("Search the library opens library search", async () => {
  const { targets, opened, toggles } = following(LAST_BOOK_PAGE);

  await followIconAction("searchLibrary", targets);

  expect([toggles(), opened]).toEqual([0, ["/search"]]);
});
