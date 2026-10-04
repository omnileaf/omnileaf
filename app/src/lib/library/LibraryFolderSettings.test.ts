import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import type { Locator } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import {
  commands,
  type FileChanges,
  type LibraryFolder,
  type RescanOutcome,
  type ScanProgress,
} from "$lib/ipc/bindings";

import type { AddFolder } from "./add-folder";
import LibraryFolderSettings from "./LibraryFolderSettings.svelte";
import type { RescanFolder } from "./rescan-folder";

type RemoveFolder = typeof commands.removeLibraryFolder;
type FolderId = Parameters<RemoveFolder>[0];

type WireFolder = Omit<LibraryFolder, "id"> & { readonly id: string };

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
  name: "Sample Manga",
  location: "/media/Sample Manga",
  isAvailable: true,
};

const NOTHING_PICKED: AddFolder = () =>
  Promise.resolve({ status: "ok", data: null });
const NOTHING_REMOVED: RemoveFolder = () =>
  Promise.resolve({ status: "ok", data: null });
const NO_CHANGES: FileChanges = {
  added: 0,
  updated: 0,
  moved: 0,
  removed: 0,
  unreadableBooks: 0,
  unreadableFolders: 0,
};

function rescanning(outcome: RescanOutcome): RescanFolder {
  return (id) =>
    Promise.resolve({ status: "ok", data: { id, name: "", outcome } });
}

const NOTHING_CHANGED = rescanning({ kind: "rescanned", ...NO_CHANGES });

/** A rescan the test steps through and then finishes. */
class PendingRescan {
  report: (progress: ScanProgress) => void = () => undefined;
  finish: (outcome: RescanOutcome) => void = () => undefined;

  readonly rescanFolder: RescanFolder = (id, onProgress) => {
    this.report = onProgress;
    return new Promise((resolve) => {
      this.finish = (outcome) => {
        resolve({ status: "ok", data: { id, name: "", outcome } });
      };
    });
  };
}

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

/** The report of a rescan, apart from the report of adding a folder that shares the section. */
function rescanReport(region: Locator): Locator {
  return region.getByRole("status").filter({ hasText: COMICS.name });
}

function linesOf(report: Locator): (string | null)[] {
  return report
    .getByRole("paragraph")
    .elements()
    .map((line) => line.textContent);
}

async function renderSettings({
  addFolder = NOTHING_PICKED,
  removeFolder = NOTHING_REMOVED,
  rescanFolder = NOTHING_CHANGED,
}: {
  addFolder?: AddFolder;
  removeFolder?: RemoveFolder;
  rescanFolder?: RescanFolder;
} = {}) {
  const screen = await render(LibraryFolderSettings, {
    listFolders: commands.libraryFolders,
    removeFolder,
    addFolder,
    rescanFolder,
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
    .toHaveTextContent("Sample Comics /media/Sample Comics Rescan Remove");
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
    .toHaveTextContent("Sample Comics /media/Sample Comics Rescan Remove");
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
    .toHaveTextContent("Sample Comics /media/Sample Comics Rescan Remove");
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
    rescanFolder: NOTHING_CHANGED,
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
      isAvailable: true,
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
  expect(home.getByRole("button", { name: /^Remove/ }).elements()).toHaveLength(
    0,
  );
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
    .toHaveTextContent("Sample Manga /media/Sample Manga Rescan Remove");
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
    .toHaveTextContent("Sample Comics /media/Sample Comics Rescan Remove");
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
    .toHaveTextContent("Sample Manga /media/Sample Manga Rescan Remove");
  await expect.element(folders.getByRole("alert")).not.toBeInTheDocument();
});

test("offers to rescan every folder, the home folder too", async () => {
  serveFolders([HOME, COMICS]);

  const { home, folders } = await renderSettings();

  await expect
    .element(home.getByRole("button", { name: "Rescan Omnileaf" }))
    .toBeVisible();
  await expect
    .element(folders.getByRole("button", { name: "Rescan Sample Comics" }))
    .toBeVisible();
});

test("reports what a rescan found changed", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: rescanning({
      kind: "rescanned",
      ...NO_CHANGES,
      added: 2,
      updated: 1,
      moved: 1,
      removed: 3,
    }),
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect.element(folders.getByText("3 books removed.")).toBeVisible();
  expect(linesOf(rescanReport(folders))).toEqual([
    "Rescanned Sample Comics.",
    "2 books added.",
    "1 book updated.",
    "1 book moved or renamed.",
    "3 books removed.",
  ]);
});

test("says a folder is up to date when the rescan found nothing changed", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings();

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Sample Comics is up to date.");
});

test("reports the books and folders a rescan couldn't read", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: rescanning({
      kind: "rescanned",
      ...NO_CHANGES,
      unreadableBooks: 1,
      unreadableFolders: 2,
    }),
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(folders.getByText("Couldn't read 2 folders inside it."))
    .toBeVisible();
  expect(linesOf(rescanReport(folders))).toEqual([
    "Sample Comics is up to date.",
    "Couldn't read 1 book in it.",
    "Couldn't read 2 folders inside it.",
  ]);
});

test("shows how far a rescan has got", async () => {
  serveFolders([HOME, COMICS]);
  const pending = new PendingRescan();
  const { folders } = await renderSettings({
    rescanFolder: pending.rescanFolder,
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  pending.report({ stage: "reading", scanned: 3, total: 7 });

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Checking Sample Comics for changes");
  await expect
    .element(folders.getByRole("progressbar"))
    .toHaveAttribute("value", "3");
  await expect.element(folders.getByText("3 of 7 books")).toBeVisible();
});

test("keeps a rescan's report when word of it arrives after it finished", async () => {
  serveFolders([HOME, COMICS]);
  const pending = new PendingRescan();
  const { folders } = await renderSettings({
    rescanFolder: pending.rescanFolder,
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();
  pending.finish({ kind: "rescanned", ...NO_CHANGES });
  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Sample Comics is up to date.");

  pending.report({ stage: "reading", scanned: 2, total: 2 });

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Sample Comics is up to date.");
  await expect
    .element(folders.getByRole("progressbar"))
    .not.toBeInTheDocument();
});

test("lets one rescan run at a time", async () => {
  serveFolders([HOME, COMICS, MANGA]);
  const pending = new PendingRescan();
  const { home, folders } = await renderSettings({
    rescanFolder: pending.rescanFolder,
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(folders.getByRole("button", { name: "Rescan Sample Manga" }))
    .toBeDisabled();
  await expect
    .element(home.getByRole("button", { name: "Rescan Omnileaf" }))
    .toBeDisabled();
});

test("keeps the books of a folder the rescan couldn't reach", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: rescanning({ kind: "unreachable" }),
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent(
      "Sample Comics isn't available. Its books stay in your library until it's back.",
    );
});

test("keeps the books of a folder the rescan found empty", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: rescanning({ kind: "foundEmpty" }),
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent(
      "Found no books in Sample Comics. Its books stay in your library in case its drive isn't connected.",
    );
});

test("says when a rescan failed", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Couldn't rescan Sample Comics. Try again.");
});

test("reports a rescan of the home folder under the home folder", async () => {
  serveFolders([HOME, COMICS]);
  const { home } = await renderSettings();

  await home.getByRole("button", { name: "Rescan Omnileaf" }).click();

  await expect
    .element(home.getByRole("status"))
    .toHaveTextContent("Omnileaf is up to date.");
});

test("marks a folder that isn't available", async () => {
  serveFolders([HOME, { ...COMICS, isAvailable: false }]);

  const { folders } = await renderSettings();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent(
      "Sample Comics Not available /media/Sample Comics Rescan Remove",
    );
});

test("shows a folder as available once a rescan reaches it again", async () => {
  const library = [HOME, { ...COMICS, isAvailable: false }];
  serveFolders(library);
  const { folders } = await renderSettings({
    rescanFolder: (id) => {
      library.splice(1, 1, COMICS);
      return NOTHING_CHANGED(id, () => undefined);
    },
  });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .not.toHaveTextContent("Not available");
});
