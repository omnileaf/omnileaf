import { expect, test } from "vitest";

import {
  DEFAULT_LIBRARY_LISTING,
  type LibraryListing,
} from "#lib/ipc/bindings.ts";
import { CommandFailure } from "#lib/ipc/fake-backend.ts";

import { sampleBackend, scenarioFrom } from "./sample-backend.ts";
import { LONG_TITLE, sampleBookId, sampleSeriesId } from "./sample-library.ts";

const NEWEST_FIRST: LibraryListing = {
  ...DEFAULT_LIBRARY_LISTING,
  sort: { by: "dateAdded", direction: "descending" },
};

function backendFor(search = "") {
  const emitted: string[] = [];
  const backend = sampleBackend(scenarioFrom(new URLSearchParams(search)), {
    emit: (event) => emitted.push(event),
  });
  return { backend, emitted };
}

test("lists the library as the boards draw it, newest first", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, NEWEST_FIRST);

  expect(page.series.slice(0, 5).map((series) => series.title)).toEqual([
    "Sample Series 01",
    "Sample Series 04",
    "Sample Series 02",
    LONG_TITLE,
    "Sample Series 03",
  ]);
});

test("counts each series' books not yet read", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, NEWEST_FIRST);

  expect(
    page.series.find((series) => series.title === "Sample Series 04")
      ?.unreadCount,
  ).toBe(6);
});

test("pages through every series with a cursor", async () => {
  const { backend } = backendFor();
  const titles: string[] = [];

  let next: string | null = null;
  do {
    const page = await backend.librarySeries(next, DEFAULT_LIBRARY_LISTING);
    titles.push(...page.series.map((series) => series.title));
    next = page.next;
  } while (next !== null);

  expect(titles).toHaveLength(19);
  expect(await backend.librarySeriesCount(DEFAULT_LIBRARY_LISTING.filter)).toBe(
    19,
  );
});

test("lists only series with every book read when asked for finished ones", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, {
    ...DEFAULT_LIBRARY_LISTING,
    filter: { ...DEFAULT_LIBRARY_LISTING.filter, finished: "only" },
  });

  expect(page.series.map((series) => series.title)).toEqual([
    "Sample Series 02",
    "Sample Series 05",
    "Sample Series 09",
    "Sample Series 15",
    "Sample Series 17",
  ]);
});

test("opens Volume 3 of Sample Series 04 on its saved page beside its neighbours", async () => {
  const { backend } = backendFor();

  const opened = await backend.openBook(sampleBookId(4, 3), []);

  expect(opened.title).toBe("Volume 3");
  expect(opened.pages).toHaveLength(192);
  expect(opened.startPage).toBe(13);
  expect(opened.previous?.title).toBe("Volume 2");
  expect(opened.next?.title).toBe("Volume 4");
});

test("keeps the page last shown, so the series carries on from it", async () => {
  const { backend, emitted } = backendFor();

  await backend.pageShown(sampleBookId(4, 3), 40, 0);
  const overview = await backend.seriesOverview(sampleSeriesId(4));

  expect(overview.upNext?.reading).toEqual({ state: "started", page: 40 });
  expect(emitted).toContain("reading-saved");
});

test("marks books read and says the library changed", async () => {
  const { backend, emitted } = backendFor();

  await backend.markBooks([sampleBookId(4, 3), sampleBookId(4, 4)], "read");
  const overview = await backend.seriesOverview(sampleSeriesId(4));

  expect(overview.readCount).toBe(4);
  expect(emitted).toContain("library-changed");
});

test("shows an empty library when asked for one", async () => {
  const { backend } = backendFor("library=empty");

  const page = await backend.librarySeries(null, DEFAULT_LIBRARY_LISTING);

  expect(page.series).toEqual([]);
});

test("fails to load the library when asked to", async () => {
  const { backend } = backendFor("library=failed");

  const listing = backend.librarySeries(null, DEFAULT_LIBRARY_LISTING);

  await expect(listing).rejects.toBeInstanceOf(CommandFailure);
});

test("can't open a book whose file is missing", async () => {
  const { backend } = backendFor("volume6=missing");

  const opening = (async () => backend.openBook(sampleBookId(4, 6), []))();

  await expect(opening).rejects.toBeInstanceOf(CommandFailure);
});

test("answers on the platform asked for", async () => {
  const { backend } = backendFor("platform=ios");

  const info = await backend.appInfo();

  expect(info.platform).toBe("ios");
});
