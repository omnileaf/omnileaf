import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { commands, type LibraryFolder } from "$lib/ipc/bindings";
import { Notices } from "$lib/notices/notices.svelte";

import type { AddFolder } from "./add-folder";
import LibraryFolderSettings from "./LibraryFolderSettings.svelte";

type RemoveFolder = typeof commands.removeLibraryFolder;
type FolderId = Parameters<RemoveFolder>[0];

type WireFolder = Omit<LibraryFolder, "id"> & { readonly id: string };

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
const MANGA: WireFolder = {
  id: "3",
  kind: "linked",
  name: "Sample Manga",
  location: "/media/Sample Manga",
};

const NOTHING_PICKED: AddFolder = () =>
  Promise.resolve({ status: "ok", data: null });
const NOTHING_REMOVED: RemoveFolder = () =>
  Promise.resolve({ status: "ok", data: null });

afterEach(() => {
  clearMocks();
});

/** Answers the library's folders from `folders` as it is at each call, one folder to a page, through the real IPC client. */
function serveFolders(folders: readonly WireFolder[]): void {
  mockIPC((command, payload) => {
    if (command !== "library_folders") {
      throw new Error(`the test serves no command \`${command}\``);
    }
    const after: unknown = Reflect.get(payload ?? {}, "after");
    const index = typeof after === "string" ? Number(after) : 0;
    return {
      folders: folders.slice(index, index + 1),
      next: index + 1 < folders.length ? String(index + 1) : null,
    };
  });
}

/** Removes folders from `library` and records which ones it was asked to remove. */
function removingFrom(library: WireFolder[]): {
  removeFolder: RemoveFolder;
  removed: FolderId[];
} {
  const removed: FolderId[] = [];
  return {
    removed,
    removeFolder: (id) => {
      removed.push(id);
      library.splice(
        library.findIndex((folder) => folder.id === id),
        1,
      );
      return Promise.resolve({ status: "ok", data: null });
    },
  };
}

async function renderSettings({
  addFolder = NOTHING_PICKED,
  removeFolder = NOTHING_REMOVED,
}: { addFolder?: AddFolder; removeFolder?: RemoveFolder } = {}) {
  const screen = await render(LibraryFolderSettings, {
    listFolders: commands.libraryFolders,
    removeFolder,
    addFolder,
    notices: new Notices(),
    usesStandIns: false,
  });
  return {
    home: screen.getByRole("region", { name: "Home folder" }),
    folders: screen.getByRole("region", { name: "Folders" }),
    dialog: screen.getByRole("alertdialog"),
  };
}

test("shows the home folder apart from the linked folders", async () => {
  serveFolders([HOME, COMICS]);

  const { home, folders } = await renderSettings();

  await expect.element(home.getByText("Omnileaf")).toBeVisible();
  await expect.element(home.getByText("/data/Omnileaf")).toBeVisible();
  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics Remove");
});

test("reads every page of folders", async () => {
  serveFolders([HOME, COMICS, MANGA]);

  const { folders } = await renderSettings();

  await expect.element(folders.getByText("Sample Manga")).toBeVisible();
  expect(folders.getByRole("listitem").elements()).toHaveLength(2);
});

test("lists a folder once it is added", async () => {
  const library = [HOME];
  serveFolders(library);
  const { folders } = await renderSettings({
    addFolder: () => {
      library.push(COMICS);
      return Promise.resolve({
        status: "ok",
        data: {
          name: COMICS.name,
          series: 3,
          books: 7,
          unreadableBooks: 0,
          unreadableFolders: 0,
        },
      });
    },
  });

  await folders.getByRole("button", { name: "Add a folder" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics Remove");
});

test("lists a folder that was saved before its scan failed", async () => {
  const library = [HOME];
  serveFolders(library);
  const { folders } = await renderSettings({
    addFolder: () => {
      library.push(COMICS);
      return Promise.resolve({
        status: "error",
        error: { code: "internal", message: "the scan stopped" },
      });
    },
  });

  await folders.getByRole("button", { name: "Add a folder" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics Remove");
});

test("says when the folders couldn't be loaded", async () => {
  const screen = await render(LibraryFolderSettings, {
    listFolders: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
    removeFolder: NOTHING_REMOVED,
    addFolder: NOTHING_PICKED,
    notices: new Notices(),
    usesStandIns: false,
  });

  await expect
    .element(screen.getByText("Couldn't load your folders. Try again later."))
    .toBeVisible();
});

test("names the home folder after the app rather than its folder on disk", async () => {
  serveFolders([
    {
      id: "1",
      kind: "home",
      name: "app.omnileaf",
      location: "/data/user/0/app.omnileaf",
    },
  ]);

  const { home } = await renderSettings();

  await expect
    .element(home.getByText("Omnileaf", { exact: true }))
    .toBeVisible();
  await expect
    .element(home.getByText("/data/user/0/app.omnileaf"))
    .toBeVisible();
});

test("offers Remove on linked folders only", async () => {
  serveFolders([HOME, COMICS]);

  const { home, folders } = await renderSettings();

  await expect
    .element(folders.getByRole("button", { name: "Remove Sample Comics" }))
    .toBeVisible();
  expect(home.getByRole("button").elements()).toHaveLength(0);
});

test("asks before removing a folder", async () => {
  const library = [HOME, COMICS];
  serveFolders(library);
  const { removeFolder, removed } = removingFrom(library);
  const { folders, dialog } = await renderSettings({ removeFolder });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(dialog.getByRole("heading", { name: "Remove Sample Comics?" }))
    .toBeVisible();
  expect(removed).toEqual([]);
});

test("removes the folder once the removal is confirmed", async () => {
  const library = [HOME, COMICS, MANGA];
  serveFolders(library);
  const { removeFolder, removed } = removingFrom(library);
  const { folders, dialog } = await renderSettings({ removeFolder });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await dialog.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Manga /media/Sample Manga Remove");
  expect(removed).toEqual([COMICS.id]);
  await expect.element(dialog).not.toBeInTheDocument();
});

test("keeps the folder when the removal is cancelled", async () => {
  const library = [HOME, COMICS];
  serveFolders(library);
  const { removeFolder, removed } = removingFrom(library);
  const { folders, dialog } = await renderSettings({ removeFolder });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect.element(dialog).not.toBeInTheDocument();
  expect(removed).toEqual([]);
  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics Remove");
});

test("says when a folder couldn't be removed", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings({
    removeFolder: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
  });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await dialog.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(folders.getByRole("alert"))
    .toHaveTextContent("Couldn't remove Sample Comics. Try again.");
});

test("drops a folder that was already removed without reporting a failure", async () => {
  const library = [HOME, COMICS, MANGA];
  serveFolders(library);
  const { folders, dialog } = await renderSettings({
    removeFolder: () => {
      library.splice(library.indexOf(COMICS), 1);
      return Promise.resolve({
        status: "error",
        error: { code: "folderNotFound", message: "from the backend" },
      });
    },
  });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await dialog.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Manga /media/Sample Manga Remove");
  await expect.element(folders.getByRole("alert")).not.toBeInTheDocument();
});
