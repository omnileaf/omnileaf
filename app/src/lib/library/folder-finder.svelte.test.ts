import { expect, test } from "vitest";

import type {
  IpcError,
  LibraryFolder,
  MissingFolder,
  RescanOutcome,
} from "#lib/ipc/bindings.ts";

import {
  FolderFinder,
  type FolderFinderEvents,
  type RelocateFolder,
} from "./folder-finder.svelte";

type Relocated = Awaited<ReturnType<RelocateFolder>>;
type FolderId = LibraryFolder["id"];

const SHARE = { server: "nas", name: "Manga" };

const MOVED: MissingFolder = {
  folder: {
    id: "folder-moved" as FolderId,
    kind: "linked",
    name: "Comics",
    location: "/media/Comics",
    isAvailable: false,
  },
  problem: { kind: "missing" },
  hiddenSeries: 3,
  isShownAnyway: false,
};

const ON_A_SHARE: MissingFolder = {
  folder: {
    id: "folder-share" as FolderId,
    kind: "linked",
    name: "Manga",
    location: "nas/Manga",
    isAvailable: false,
  },
  problem: { kind: "shareUnreachable", share: SHARE },
  hiddenSeries: 2,
  isShownAnyway: false,
};

const FAILED: IpcError = { code: "folderUnreadable", message: "no access" };

const NO_CHANGES = {
  added: 0,
  updated: 0,
  moved: 0,
  removed: 0,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

function relocatedTo(
  missing: MissingFolder,
  outcome: RescanOutcome,
): Relocated {
  return {
    status: "ok",
    data: { id: missing.folder.id, name: missing.folder.name, outcome },
  };
}

class FinderRecord {
  readonly relocated: string[] = [];
  readonly heard: string[] = [];
  settled: Promise<void>;
  #settle: () => void = () => undefined;

  constructor(private readonly answer: Relocated) {
    this.settled = this.#nextSettle();
  }

  readonly relocate: RelocateFolder = (missing) => {
    this.relocated.push(missing.folder.id);
    return Promise.resolve(this.answer);
  };

  readonly events: FolderFinderEvents = {
    onError: (error) => this.heard.push(`error ${error.code}`),
    onShareStillUnreachable: ({ folder }) =>
      this.heard.push(`still unreachable ${folder.id}`),
    onShareBack: ({ folder }) => this.heard.push(`back ${folder.id}`),
    onSettled: () => {
      this.heard.push("settled");
      this.#settle();
      return Promise.resolve();
    },
  };

  #nextSettle(): Promise<void> {
    return new Promise((resolve) => {
      this.#settle = resolve;
    });
  }
}

test("relocates a folder that isn't on a share straight away", async () => {
  const record = new FinderRecord(relocatedTo(MOVED, { kind: "foundEmpty" }));
  const finder = new FolderFinder(record.relocate, record.events);

  finder.find(MOVED);
  await record.settled;

  expect([record.relocated, record.heard, finder.shareToChoose]).toEqual([
    ["folder-moved"],
    ["settled"],
    undefined,
  ]);
});

test("asks to choose a share again before relocating a folder on it", () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);

  finder.find(ON_A_SHARE);

  expect([record.relocated, finder.shareToChoose]).toEqual([
    [],
    { name: "Manga", share: SHARE },
  ]);
});

test("relocates the share's folder once choosing it again goes on", async () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);
  finder.find(ON_A_SHARE);

  finder.continueChoosing();
  await record.settled;

  expect([record.relocated, finder.shareToChoose]).toEqual([
    ["folder-share"],
    undefined,
  ]);
});

test("relocates nothing when choosing the share again stops", () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);
  finder.find(ON_A_SHARE);

  finder.stopChoosing();

  expect([record.relocated, finder.shareToChoose]).toEqual([[], undefined]);
});

test("says a share is still unreachable when relocating can't reach it", async () => {
  const record = new FinderRecord(
    relocatedTo(ON_A_SHARE, { kind: "unreachable" }),
  );
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.relocate(ON_A_SHARE);

  expect(record.heard).toEqual(["still unreachable folder-share", "settled"]);
});

test("says a share is back once relocating reaches it", async () => {
  const record = new FinderRecord(
    relocatedTo(ON_A_SHARE, { kind: "rescanned", ...NO_CHANGES }),
  );
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.relocate(ON_A_SHARE);

  expect(record.heard).toEqual(["back folder-share", "settled"]);
});

test("says nothing about a share when no folder is chosen", async () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.relocate(ON_A_SHARE);

  expect(record.heard).toEqual(["settled"]);
});

test("says nothing about reaching a folder that isn't on a share", async () => {
  const record = new FinderRecord(relocatedTo(MOVED, { kind: "unreachable" }));
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.relocate(MOVED);

  expect(record.heard).toEqual(["settled"]);
});

test("reports a relocation that fails and still settles", async () => {
  const record = new FinderRecord({ status: "error", error: FAILED });
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.relocate(MOVED);

  expect(record.heard).toEqual(["error folderUnreadable", "settled"]);
});

test("finds the folder a lookup answers", async () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.findFrom(Promise.resolve({ status: "ok", data: MOVED }));
  await record.settled;

  expect(record.relocated).toEqual(["folder-moved"]);
});

test("settles without finding anything when a lookup answers no folder", async () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.findFrom(Promise.resolve({ status: "ok", data: null }));

  expect([record.relocated, record.heard]).toEqual([[], ["settled"]]);
});

test("reports a lookup that fails and finds nothing", async () => {
  const record = new FinderRecord({ status: "ok", data: null });
  const finder = new FolderFinder(record.relocate, record.events);

  await finder.findFrom(Promise.resolve({ status: "error", error: FAILED }));

  expect([record.relocated, record.heard]).toEqual([
    [],
    ["error folderUnreadable"],
  ]);
});

test("reports an error with no receiver, as the window's reportError needs", async () => {
  const record = new FinderRecord({ status: "error", error: FAILED });
  const receivers: unknown[] = [];
  const finder = new FolderFinder(record.relocate, {
    ...record.events,
    onError(this: unknown) {
      receivers.push(this);
    },
  });

  await finder.relocate(MOVED);
  await finder.findFrom(Promise.resolve({ status: "error", error: FAILED }));

  expect(receivers).toEqual([undefined, undefined]);
});
