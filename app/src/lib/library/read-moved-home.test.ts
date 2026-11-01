import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { commands, type LibraryFolder } from "#lib/ipc/bindings.ts";

import { LibraryFolders } from "./library-folders.svelte";
import { readMovedHome } from "./read-moved-home";
import { type RescanFolder, rescanFolderWithProgress } from "./rescan-folder";
import { Rescans } from "./rescans.svelte";

type WireFolder = Omit<LibraryFolder, "id"> & { readonly id: string };

const OLD_HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "App storage",
  isAvailable: true,
};
const MOVED_HOME: WireFolder = {
  id: "2",
  kind: "home",
  name: "Comics",
  location: "Internal storage › Comics",
  isAvailable: true,
};
const OLD_HOME_KEPT: WireFolder = { ...OLD_HOME, kind: "linked" };

const RESCANNED = {
  id: MOVED_HOME.id,
  name: "Comics",
  outcome: {
    kind: "rescanned",
    added: 12,
    updated: 0,
    moved: 0,
    removed: 0,
    unreadableBooks: 0,
    unsupportedBooks: 0,
    unreadableFolders: 0,
  },
};

afterEach(() => {
  clearMocks();
});

const failingRescan: RescanFolder = () =>
  Promise.resolve({
    status: "error",
    error: { code: "internal", message: "sample failure" },
  });

class Library {
  readonly rescanned: unknown[] = [];
  readonly folders = new LibraryFolders(
    commands.libraryFolders,
    commands.removeLibraryFolder,
    commands.libraryFolderBookCount,
  );
  readonly rescans: Rescans;

  constructor(
    lists: (readonly WireFolder[])[],
    { rescanFails = false }: { rescanFails?: boolean } = {},
  ) {
    this.rescans = new Rescans(
      rescanFails ? failingRescan : rescanFolderWithProgress,
      commands.removeBooksOfEmptiedFolder,
    );
    mockIPC((command, payload) => {
      if (command === "library_folders") {
        const folders = lists.length > 1 ? lists.shift() : lists[0];
        return { folders, next: null };
      }
      if (command === "rescan_library_folder") {
        this.rescanned.push(payload);
        return RESCANNED;
      }
      throw new Error(`unexpected command ${command}`);
    });
  }
}

function movedTo(folder: WireFolder): LibraryFolder["id"] {
  return folder.id as LibraryFolder["id"];
}

test("rescans the folder the library moved to", async () => {
  const library = new Library([[MOVED_HOME]]);

  await readMovedHome(library.folders, library.rescans, movedTo(MOVED_HOME));

  expect(library.rescanned).toMatchObject([{ id: MOVED_HOME.id }]);
});

test("shows the moved folder as the home folder once read", async () => {
  const library = new Library([[OLD_HOME], [MOVED_HOME]]);
  await library.folders.load();

  await readMovedHome(library.folders, library.rescans, movedTo(MOVED_HOME));

  expect(
    library.folders.list.kind === "loaded" && library.folders.list.home?.id,
  ).toBe(MOVED_HOME.id);
});

test("lists the old home folder as linked once the move leaves its books there", async () => {
  const library = new Library([[MOVED_HOME], [MOVED_HOME, OLD_HOME_KEPT]]);

  await readMovedHome(library.folders, library.rescans, movedTo(MOVED_HOME));

  expect(
    library.folders.list.kind === "loaded" &&
      library.folders.list.linked.map((folder) => folder.id),
  ).toEqual([OLD_HOME_KEPT.id]);
});

test("reports the rescan as finished once the books are read", async () => {
  const library = new Library([[MOVED_HOME]]);

  await readMovedHome(library.folders, library.rescans, movedTo(MOVED_HOME));

  expect(library.rescans.status.kind).toBe("finished");
});

test("reports a failed rescan and still lists the moved folder", async () => {
  const library = new Library([[MOVED_HOME]], { rescanFails: true });

  await readMovedHome(library.folders, library.rescans, movedTo(MOVED_HOME));

  expect([
    library.rescans.status.kind,
    library.folders.list.kind === "loaded" && library.folders.list.home?.id,
  ]).toEqual(["failed", MOVED_HOME.id]);
});

test("rescans nothing when the moved folder isn't listed", async () => {
  const library = new Library([[OLD_HOME]]);

  await readMovedHome(library.folders, library.rescans, movedTo(MOVED_HOME));

  expect(library.rescanned).toEqual([]);
});
