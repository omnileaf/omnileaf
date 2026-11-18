import { expect, test } from "vitest";

import type {
  IpcError,
  LibraryFolder,
  MissingFolder,
} from "#lib/ipc/bindings.ts";

import { checkFolderAgain, type RescanAway } from "./folder-check";
import type { MissingFolderLookup } from "./folder-finder.svelte";

type Looked = Awaited<MissingFolderLookup>;

const AWAY: MissingFolder = {
  folder: {
    id: "folder-away" as LibraryFolder["id"],
    kind: "linked",
    name: "Comics",
    location: "/storage/1A2B-3C4D/Comics",
    isAvailable: false,
  },
  problem: { kind: "driveDisconnected" },
  hiddenSeries: 0,
  isShownAnyway: true,
};

const FAILED: IpcError = { code: "folderUnreadable", message: "no access" };

function answering(...answers: Looked[]): () => MissingFolderLookup {
  return () => {
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error("looked up more often than the test expects");
    }
    return Promise.resolve(answer);
  };
}

function rescanning(rescanned: string[]): RescanAway {
  return (id) => {
    rescanned.push(id);
    return Promise.resolve({ status: "ok" });
  };
}

test("says the folder is back once a rescan finds it", async () => {
  const rescanned: string[] = [];

  const checked = await checkFolderAgain(
    answering({ status: "ok", data: AWAY }, { status: "ok", data: null }),
    rescanning(rescanned),
  );

  expect({ checked, rescanned }).toEqual({
    checked: { status: "ok", data: "back" },
    rescanned: ["folder-away"],
  });
});

test("says the folder is still away when a rescan doesn't find it", async () => {
  const checked = await checkFolderAgain(
    answering({ status: "ok", data: AWAY }, { status: "ok", data: AWAY }),
    rescanning([]),
  );

  expect(checked).toEqual({ status: "ok", data: "stillAway" });
});

test("rescans nothing when no folder is away", async () => {
  const rescanned: string[] = [];

  const checked = await checkFolderAgain(
    answering({ status: "ok", data: null }),
    rescanning(rescanned),
  );

  expect({ checked, rescanned }).toEqual({
    checked: { status: "ok", data: "nothingAway" },
    rescanned: [],
  });
});

test("hands back a lookup that fails", async () => {
  const checked = await checkFolderAgain(
    answering({ status: "error", error: FAILED }),
    rescanning([]),
  );

  expect(checked).toEqual({ status: "error", error: FAILED });
});

test("hands back a rescan that fails without looking again", async () => {
  const checked = await checkFolderAgain(
    answering({ status: "ok", data: AWAY }),
    () => Promise.resolve({ status: "error", error: FAILED }),
  );

  expect(checked).toEqual({ status: "error", error: FAILED });
});
