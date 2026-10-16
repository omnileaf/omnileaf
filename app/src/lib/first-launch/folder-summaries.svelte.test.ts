import { expect, test } from "vitest";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

import { FolderSummaries } from "./folder-summaries.svelte";

function folder(id: string): LibraryFolder {
  return {
    id: id as LibraryFolder["id"],
    kind: "linked",
    name: id,
    location: `/media/${id}`,
    isAvailable: true,
  };
}

const COMICS = folder("comics");
const MANGA = folder("manga");
const SERIES = new Map([
  [COMICS.id, 180],
  [MANGA.id, 32],
]);
const BOOKS = new Map([
  [COMICS.id, 900],
  [MANGA.id, 38],
]);

function summaries(): FolderSummaries {
  return new FolderSummaries(
    (asked) => Promise.resolve(SERIES.get(asked.id)),
    (asked) => Promise.resolve(BOOKS.get(asked.id)),
  );
}

test("sums up each folder's series and books", async () => {
  const found = summaries();

  await found.load([COMICS, MANGA]);

  expect([found.of(COMICS), found.of(MANGA)]).toEqual([
    { series: 180, books: 900 },
    { series: 32, books: 38 },
  ]);
});

test("adds up the series and books of the folders asked about", async () => {
  const found = summaries();
  await found.load([COMICS, MANGA]);

  const total = found.total([COMICS, MANGA]);

  expect(total).toEqual({ series: 212, books: 938 });
});

test("leaves out a folder it couldn't count", async () => {
  const found = new FolderSummaries(
    () => Promise.resolve(undefined),
    () => Promise.resolve(3),
  );

  await found.load([COMICS]);

  expect([found.of(COMICS), found.total([COMICS])]).toEqual([
    undefined,
    { series: 0, books: 0 },
  ]);
});

test("knows when every folder asked about has been counted", async () => {
  const found = summaries();
  const before = found.hasCounted([COMICS, MANGA]);

  await found.load([COMICS]);

  expect([
    before,
    found.hasCounted([COMICS]),
    found.hasCounted([COMICS, MANGA]),
  ]).toEqual([false, true, false]);
});
