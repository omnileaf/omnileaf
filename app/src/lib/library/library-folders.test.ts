import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { commands, type LibraryFolder } from "$lib/ipc/bindings";

import { LibraryFolders } from "./library-folders.svelte";

type WireFolder = Omit<LibraryFolder, "id"> & { readonly id: string };
type Answer = (folders: readonly WireFolder[]) => void;

const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "/data/Omnileaf",
};
const COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
};

afterEach(() => {
  clearMocks();
});

/** Holds every request for the library's folders until the test answers it. */
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
  const folders = new LibraryFolders(commands.libraryFolders);
  const older = folders.load();
  const newer = folders.load();
  await expect.poll(requests.waiting).toBe(2);
  requests.answer(1, [HOME]);
  await newer;

  requests.answer(0, [HOME, COMICS]);
  await older;

  expect(folders.list).toEqual({ kind: "loaded", home: HOME, linked: [] });
});
