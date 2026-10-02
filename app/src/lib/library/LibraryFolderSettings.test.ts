import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { commands } from "$lib/ipc/bindings";

import LibraryFolderSettings from "./LibraryFolderSettings.svelte";

type AddFolder = typeof commands.addLibraryFolder;

interface WireFolder {
  readonly id: string;
  readonly kind: "home" | "linked";
  readonly name: string;
  readonly location: string;
}

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

afterEach(() => {
  clearMocks();
});

/** Answers the library's folders from `folders`, one folder to a page, through the real IPC client. */
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

async function renderSettings(addFolder: AddFolder = NOTHING_PICKED) {
  const screen = await render(LibraryFolderSettings, {
    listFolders: commands.libraryFolders,
    addFolder,
  });
  return {
    home: screen.getByRole("region", { name: "Home folder" }),
    folders: screen.getByRole("region", { name: "Folders" }),
  };
}

test("shows the home folder apart from the linked folders", async () => {
  serveFolders([HOME, COMICS]);

  const { home, folders } = await renderSettings();

  await expect.element(home.getByText("Omnileaf")).toBeVisible();
  await expect.element(home.getByText("/data/Omnileaf")).toBeVisible();
  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics");
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
  const { folders } = await renderSettings(() => {
    library.push(COMICS);
    return Promise.resolve({
      status: "ok",
      data: { name: COMICS.name, comicFiles: 3, unreadableFolders: 0 },
    });
  });

  await folders.getByRole("button", { name: "Add a folder" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics");
});

test("says when the folders couldn't be loaded", async () => {
  const screen = await render(LibraryFolderSettings, {
    listFolders: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
    addFolder: NOTHING_PICKED,
  });

  await expect
    .element(screen.getByText("Couldn't load your folders. Try again later."))
    .toBeVisible();
});
