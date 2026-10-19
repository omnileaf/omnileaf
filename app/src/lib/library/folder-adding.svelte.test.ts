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

test("names the folder being added until its scan ends", async () => {
  const notices = new Notices();
  let endScan: () => void = () => {};
  const adding = new FolderAdding(
    async (onProgress) => {
      onProgress({
        stage: "adding",
        name: "Manga",
        location: "/media/usb/Manga",
      });
      onProgress({ stage: "finding", found: 38 });
      await new Promise<void>((resolve) => {
        endScan = resolve;
      });
      return { status: "ok", data: SCAN };
    },
    () => notices,
  );

  const added = adding.add();
  await Promise.resolve();
  const whileScanning = adding.beingAdded;
  endScan();
  await added;

  expect([whileScanning, adding.beingAdded]).toEqual([
    { name: "Manga", location: "/media/usb/Manga" },
    undefined,
  ]);
});

test("adds a dropped folder through its own command without asking first", async () => {
  const { addFolder, picks } = countingPicks();
  const notices = new Notices();
  let asked = 0;
  const adding = new FolderAdding(
    addFolder,
    () => notices,
    () => {},
    () => {
      asked += 1;
      return Promise.resolve(true);
    },
  );

  await adding.addWith(() => Promise.resolve({ status: "ok", data: SCAN }));

  expect([asked, picks(), adding.outcome.kind]).toEqual([0, 0, "scanned"]);
});
