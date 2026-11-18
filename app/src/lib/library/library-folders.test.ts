import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { commands, type LibraryFolder } from "#lib/ipc/bindings.ts";

import { LibraryFolders, readFolderList } from "./library-folders.svelte";

type WireFolder = Omit<LibraryFolder, "id"> & { readonly id: string };
type Answer = (folders: readonly WireFolder[]) => void;

const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "/data/Omnileaf",
  isAvailable: true,
};
const COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
};

const MANGA: WireFolder = {
  id: "3",
  kind: "linked",
  name: "Manga",
  location: "/media/Manga",
  isAvailable: true,
};
const SECOND_PAGE = "after-comics";

afterEach(() => {
  clearMocks();
});

function holdFolderRequests(): {
  waiting: () => number;
  answer: (index: number, folders: readonly WireFolder[]) => void;
} {
  const answers: Answer[] = [];
  mockIPC(
    () =>
      new Promise((resolve) => {
        answers.push((folders) => {
          resolve({ folders, next: null });
        });
      }),
  );
  return {
    waiting: () => answers.length,
    answer: (index, folders) => {
      const answer = answers[index];
      if (answer === undefined) {
        throw new Error(`no request ${String(index)} for folders is waiting`);
      }
      answer(folders);
    },
  };
}

test("keeps the newer list when an older load finishes after it", async () => {
  const requests = holdFolderRequests();
  const folders = new LibraryFolders(
    commands.libraryFolders,
    commands.removeLibraryFolder,
    commands.libraryFolderBookCount,
  );
  const older = folders.load();
  const newer = folders.load();
  await expect.poll(requests.waiting).toBe(2);
  requests.answer(1, [HOME]);
  await newer;

  requests.answer(0, [HOME, COMICS]);
  await older;

  expect(folders.list).toEqual({ kind: "loaded", home: HOME, linked: [] });
});

async function loadLinked(
  folders: LibraryFolders,
  folder: WireFolder,
): Promise<LibraryFolder> {
  mockIPC(() => ({ folders: [folder], next: null }));
  await folders.load();
  const linked =
    folders.list.kind === "loaded" ? folders.list.linked[0] : undefined;
  if (linked === undefined) {
    throw new Error(`${folder.name} didn't load as a linked folder`);
  }
  return linked;
}

test("counts the books of a folder", async () => {
  const folders = new LibraryFolders(
    commands.libraryFolders,
    commands.removeLibraryFolder,
    (id) => Promise.resolve({ status: "ok", data: id === COMICS.id ? 342 : 0 }),
  );
  const comics = await loadLinked(folders, COMICS);

  const books = await folders.countBooks(comics);

  expect(books).toBe(342);
});

test("leaves the count out when the books couldn't be counted", async () => {
  const folders = new LibraryFolders(
    commands.libraryFolders,
    commands.removeLibraryFolder,
    () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
  );
  const comics = await loadLinked(folders, COMICS);

  const books = await folders.countBooks(comics);

  expect(books).toBeUndefined();
});

test("reads the folders on every page, home apart from the linked ones", async () => {
  mockIPC((_command, args) =>
    (args as { after: string | null }).after === null
      ? { folders: [HOME, COMICS], next: SECOND_PAGE }
      : { folders: [MANGA], next: null },
  );

  const folders = await readFolderList(commands.libraryFolders);

  expect(folders).toEqual({
    kind: "loaded",
    home: HOME,
    linked: [COMICS, MANGA],
  });
});

test("reads no folders when a later page fails", async () => {
  mockIPC((_command, args) => {
    if ((args as { after: string | null }).after === null) {
      return { folders: [HOME, COMICS], next: SECOND_PAGE };
    }
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
    throw { code: "internal", message: "the second page is gone" };
  });

  const folders = await readFolderList(commands.libraryFolders);

  expect(folders).toEqual({ kind: "failed" });
});
