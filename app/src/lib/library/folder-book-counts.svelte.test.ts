import { expect, test } from "vitest";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

import { FolderBookCounts } from "./folder-book-counts.svelte";

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

test("counts the books in each folder it loads", async () => {
  const books = new Map([
    [COMICS.id, 214],
    [MANGA.id, 38],
  ]);
  const counts = new FolderBookCounts((asked) =>
    Promise.resolve(books.get(asked.id)),
  );

  await counts.load([COMICS, MANGA]);

  expect([counts.of(COMICS), counts.of(MANGA)]).toEqual([214, 38]);
});

test("knows no count for a folder it couldn't count", async () => {
  const counts = new FolderBookCounts(() => Promise.resolve(undefined));

  await counts.load([COMICS]);

  expect(counts.of(COMICS)).toBeUndefined();
});

test("keeps the latest count when a folder is counted again", async () => {
  let books = 3;
  const counts = new FolderBookCounts(() => Promise.resolve(books));
  await counts.load([COMICS]);
  books = 7;

  await counts.load([COMICS]);

  expect(counts.of(COMICS)).toBe(7);
});
