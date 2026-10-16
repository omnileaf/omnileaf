import { expect, test } from "vitest";

import { Notices } from "#lib/notices/notices.ts";

import type { AddFolder } from "./add-folder";
import { FolderAdding } from "./folder-adding.svelte";

const SCAN = {
  name: "Comics",
  series: 3,
  books: 7,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

function countingPicks(): { addFolder: AddFolder; picks: () => number } {
  let picks = 0;
  return {
    addFolder: () => {
      picks += 1;
      return Promise.resolve({ status: "ok", data: SCAN });
    },
    picks: () => picks,
  };
}

test("opens no picker and stays idle when asked first and told not to", async () => {
  const { addFolder, picks } = countingPicks();
  const notices = new Notices();
  const adding = new FolderAdding(
    addFolder,
    () => notices,
    () => {},
    () => Promise.resolve(false),
  );

  await adding.add();

  expect([picks(), adding.outcome.kind]).toEqual([0, "idle"]);
});

test("stays enabled while it asks before picking", async () => {
  const { addFolder } = countingPicks();
  const notices = new Notices();
  let answer: (goesOn: boolean) => void = () => {};
  const adding = new FolderAdding(
    addFolder,
    () => notices,
    () => {},
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );

  const added = adding.add();
  const whileAsking = adding.isAdding;
  answer(true);
  await added;

  expect([whileAsking, adding.outcome.kind]).toEqual([false, "scanned"]);
});
