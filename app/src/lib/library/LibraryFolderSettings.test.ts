import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import {
  commands,
  type FileChanges,
  type LibraryFolder,
  type RescanOutcome,
  type ScanProgress,
} from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.svelte.ts";

import type { AddFolder } from "./add-folder";
import LibraryFolderSettings from "./LibraryFolderSettings.svelte";
import type { RescanFolder } from "./rescan-folder";
import type { PutBackFolderBooks, RemoveFolderBooks } from "./rescans.svelte";

type RemoveFolder = typeof commands.removeLibraryFolder;
type CountFolderBooks = typeof commands.libraryFolderBookCount;
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
const BOOKS_IN_COMICS = 342;
const COUNTED: CountFolderBooks = () =>
  Promise.resolve({ status: "ok", data: BOOKS_IN_COMICS });
const STILL_COUNTING: CountFolderBooks = () => new Promise(() => undefined);
const NO_CHANGES: FileChanges = {
  added: 0,
  updated: 0,
  moved: 0,
  removed: 0,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

function rescanning(outcome: RescanOutcome): RescanFolder {
  return (id) =>
    Promise.resolve({ status: "ok", data: { id, name: "", outcome } });
}

const NOTHING_CHANGED = rescanning({ kind: "rescanned", ...NO_CHANGES });
const FOUND_EMPTY = rescanning({ kind: "foundEmpty" });
const BOOKS_REMOVED: RemoveFolderBooks = () =>
  Promise.resolve({ status: "ok", data: { kind: "removed", books: 3 } });
const BOOKS_PUT_BACK: PutBackFolderBooks = () =>
  Promise.resolve({ status: "ok", data: true });

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
  countFolderBooks = COUNTED,
  removeFolderBooks = BOOKS_REMOVED,
  putBackFolderBooks = BOOKS_PUT_BACK,
}: {
  addFolder?: AddFolder;
  removeFolder?: RemoveFolder;
  rescanFolder?: RescanFolder;
  countFolderBooks?: CountFolderBooks;
  removeFolderBooks?: RemoveFolderBooks;
  putBackFolderBooks?: PutBackFolderBooks;
} = {}) {
  const notices = new Notices();
  const screen = await render(LibraryFolderSettings, {
    listFolders: commands.libraryFolders,
    removeFolder,
    countFolderBooks,
    addFolder,
    rescanFolder,
    removeFolderBooks,
    putBackFolderBooks,
    notices,
    usesStandIns: false,
    platform: "linux",
  });
  return {
    notices,
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
          unsupportedBooks: 0,
          unreadableFolders: 0,
        },
      });
    },
  });

  await folders.getByRole("button", { name: "Add a folder" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Comics /media/Sample Comics");
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
    .toHaveTextContent("Sample Comics /media/Sample Comics");
});

test("says when the folders couldn't be loaded", async () => {
  const screen = await render(LibraryFolderSettings, {
    listFolders: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
    removeFolder: NOTHING_REMOVED,
    countFolderBooks: COUNTED,
    addFolder: NOTHING_PICKED,
    rescanFolder: NOTHING_CHANGED,
    removeFolderBooks: BOOKS_REMOVED,
    putBackFolderBooks: BOOKS_PUT_BACK,
    notices: new Notices(),
    usesStandIns: false,
    platform: "linux",
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

test('shows Remove as an icon with "Remove folder" as the tooltip', async () => {
  serveFolders([HOME, COMICS]);

  const { folders } = await renderSettings();

  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });
  await expect.element(remove).toHaveTextContent("");
  await expect.element(remove).toHaveAttribute("title", "Remove folder");
});

test("reaches Remove from the keyboard", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings();
  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });
  await expect.element(remove).toBeVisible();
  folders
    .getByRole("button", { name: "Rescan Sample Comics" })
    .element()
    .focus();

  await userEvent.tab();

  await expect.element(remove).toHaveFocus();
});

test("asks before removing a folder", async () => {
  const library = [HOME, COMICS];
  serveFolders(library);
  const { removeFolder, removed } = removingFrom(library);
  const { folders, dialog } = await renderSettings({ removeFolder });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(dialog.getByRole("heading", { name: "Remove this folder?" }))
    .toBeVisible();
  expect(removed).toEqual([]);
});

test("shows the folder being removed with its location and books", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings();

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(dialog.getByText("Sample Comics", { exact: true }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("/media/Sample Comics · 342 books"))
    .toBeVisible();
});

test("counts the books of the folder being removed", async () => {
  serveFolders([HOME, COMICS, MANGA]);
  const counted: FolderId[] = [];
  const { folders, dialog } = await renderSettings({
    countFolderBooks: (id) => {
      counted.push(id);
      return COUNTED(id);
    },
  });

  await folders.getByRole("button", { name: "Remove Sample Manga" }).click();

  await expect.element(dialog).toBeVisible();
  expect(counted).toEqual([MANGA.id]);
});

test("says book, not books, for a folder of one", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings({
    countFolderBooks: () => Promise.resolve({ status: "ok", data: 1 }),
  });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(dialog.getByText("/media/Sample Comics · 1 book", { exact: true }))
    .toBeVisible();
});

test("shows the folder's location alone while its books are counted", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings({
    countFolderBooks: STILL_COUNTING,
  });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(dialog.getByText("/media/Sample Comics", { exact: true }))
    .toBeVisible();
  await expect.element(dialog).not.toHaveTextContent("·");
});

test("shows the folder's location alone when its books couldn't be counted", async () => {
  serveFolders([HOME, COMICS]);
  let answered: Promise<unknown> = Promise.resolve();
  const { folders, dialog } = await renderSettings({
    countFolderBooks: () => {
      const failure = Promise.resolve({
        status: "error" as const,
        error: { code: "internal" as const, message: "from the backend" },
      });
      answered = failure;
      return failure;
    },
  });

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();
  await answered;

  await expect
    .element(dialog.getByText("/media/Sample Comics", { exact: true }))
    .toBeVisible();
  await expect.element(dialog).not.toHaveTextContent("·");
});

test("keeps a slow count off a folder asked about after it", async () => {
  serveFolders([HOME, COMICS, MANGA]);
  const answers = new Map<string, (books: number) => void>();
  const { folders, dialog } = await renderSettings({
    countFolderBooks: (id) =>
      new Promise((resolve) => {
        answers.set(id, (books) => {
          resolve({ status: "ok", data: books });
        });
      }),
  });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await folders.getByRole("button", { name: "Remove Sample Manga" }).click();
  answers.get(MANGA.id)?.(12);
  await expect
    .element(dialog.getByText("/media/Sample Manga · 12 books"))
    .toBeVisible();

  answers.get(COMICS.id)?.(BOOKS_IN_COMICS);
  await new Promise((resolve) => setTimeout(resolve));

  await expect
    .element(dialog.getByText("/media/Sample Manga · 12 books"))
    .toBeVisible();
});

test("says the folder's files stay where they are", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings();

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(
      dialog.getByText(
        "Its books leave your library. The files stay where they are, and you can add the folder again.",
      ),
    )
    .toBeVisible();
});

test("names the removal question by its title and describes it by the folder and what happens", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings();

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect.element(dialog).toHaveAccessibleName("Remove this folder?");
  await expect
    .element(dialog)
    .toHaveAccessibleDescription(
      "Sample Comics /media/Sample Comics · 342 books Its books leave your library. The files stay where they are, and you can add the folder again.",
    );
});

test("marks the removal with a folder-minus badge rather than a bin", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings();

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect.element(dialog).toBeVisible();
  const icons = dialog.element().querySelectorAll("svg");
  expect([...icons].map((icon) => icon.classList[1])).toEqual([
    "lucide-folder-minus",
    "lucide-folder",
    "lucide-shield-check",
  ]);
});

test("starts the removal question on Cancel", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, dialog } = await renderSettings();

  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
});

test("removes the folder once the removal is confirmed", async () => {
  const library = [HOME, COMICS, MANGA];
  serveFolders(library);
  const { removeFolder, removed } = removingFrom(library);
  const { folders, dialog } = await renderSettings({ removeFolder });
  await folders.getByRole("button", { name: "Remove Sample Comics" }).click();

  await dialog.getByRole("button", { name: "Remove folder" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Manga /media/Sample Manga");
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
    .toHaveTextContent("Sample Comics /media/Sample Comics");
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

  await dialog.getByRole("button", { name: "Remove folder" }).click();

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

  await dialog.getByRole("button", { name: "Remove folder" }).click();

  await expect
    .element(folders.getByRole("listitem"))
    .toHaveTextContent("Sample Manga /media/Sample Manga");
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

test("shows Rescan as an icon with its verb as the tooltip", async () => {
  serveFolders([HOME, COMICS]);

  const { home, folders } = await renderSettings();

  for (const rescan of [
    home.getByRole("button", { name: "Rescan Omnileaf" }),
    folders.getByRole("button", { name: "Rescan Sample Comics" }),
  ]) {
    await expect.element(rescan).toHaveTextContent("");
    await expect.element(rescan).toHaveAttribute("title", "Rescan");
  }
});

test("reaches Rescan from the keyboard", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings();
  const rescan = folders.getByRole("button", { name: "Rescan Sample Comics" });
  await expect.element(rescan).toBeVisible();
  folders.getByRole("button", { name: "Add a folder" }).element().focus();

  await userEvent.tab();

  await expect.element(rescan).toHaveFocus();
});

test("spins only the Rescan icon of the folder being rescanned", async () => {
  serveFolders([HOME, COMICS]);
  const pending = new PendingRescan();
  const { home, folders } = await renderSettings({
    rescanFolder: pending.rescanFolder,
  });
  const rescan = folders.getByRole("button", { name: "Rescan Sample Comics" });

  await rescan.click();

  await expect
    .element(rescan.getByRole("img", { includeHidden: true }))
    .toHaveClass("motion-safe:animate-spin");
  await expect
    .element(
      home
        .getByRole("button", { name: "Rescan Omnileaf" })
        .getByRole("img", { includeHidden: true }),
    )
    .not.toHaveClass("motion-safe:animate-spin");
});

test("stops spinning the Rescan icon once the rescan finishes", async () => {
  serveFolders([HOME, COMICS]);
  const pending = new PendingRescan();
  const { folders } = await renderSettings({
    rescanFolder: pending.rescanFolder,
  });
  const rescan = folders.getByRole("button", { name: "Rescan Sample Comics" });
  await rescan.click();

  pending.finish({ kind: "rescanned", ...NO_CHANGES });

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Sample Comics is up to date.");
  await expect
    .element(rescan.getByRole("img", { includeHidden: true }))
    .not.toHaveClass("motion-safe:animate-spin");
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

test("reports the books and folders a rescan couldn't read or open yet", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: rescanning({
      kind: "rescanned",
      ...NO_CHANGES,
      unreadableBooks: 1,
      unsupportedBooks: 3,
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
    "3 books are CBR or CB7 files, which this version can't open yet.",
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

test("offers to remove the books of a folder the rescan found empty", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({ rescanFolder: FOUND_EMPTY });

  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await expect
    .element(folders.getByRole("button", { name: "Remove its books" }))
    .toBeVisible();
});

test("never offers to remove the books of a folder the rescan couldn't reach", async () => {
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
  expect(
    folders.getByRole("button", { name: "Remove its books" }).elements(),
  ).toEqual([]);
});

test("removes the books of the folder found empty and offers to undo", async () => {
  serveFolders([HOME, COMICS]);
  const removedFrom: FolderId[] = [];
  const { folders, notices } = await renderSettings({
    rescanFolder: FOUND_EMPTY,
    removeFolderBooks: (id) => {
      removedFrom.push(id);
      return BOOKS_REMOVED(id);
    },
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await folders.getByRole("button", { name: "Remove its books" }).click();

  await expect.poll(() => notices.undoOffer?.message).toBe("3 books removed");
  expect(removedFrom).toEqual([COMICS.id]);
  await expect.element(rescanReport(folders)).not.toBeInTheDocument();
});

test("puts the books back when the removal is undone", async () => {
  serveFolders([HOME, COMICS]);
  const putBackTo: FolderId[] = [];
  const { folders, notices } = await renderSettings({
    rescanFolder: FOUND_EMPTY,
    putBackFolderBooks: (id) => {
      putBackTo.push(id);
      return BOOKS_PUT_BACK(id);
    },
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();
  await folders.getByRole("button", { name: "Remove its books" }).click();
  await expect.poll(() => notices.undoOffer).toBeDefined();

  notices.undo();

  await expect.poll(() => putBackTo).toEqual([COMICS.id]);
});

test("rescans a folder whose books stayed because it holds books again", async () => {
  serveFolders([HOME, COMICS]);
  const outcomes: RescanOutcome[] = [
    { kind: "foundEmpty" },
    { kind: "rescanned", ...NO_CHANGES, added: 2 },
  ];
  const { folders, notices } = await renderSettings({
    rescanFolder: (id) =>
      rescanning(outcomes.shift() ?? { kind: "foundEmpty" })(
        id,
        () => undefined,
      ),
    removeFolderBooks: () =>
      Promise.resolve({ status: "ok", data: { kind: "kept" } }),
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await folders.getByRole("button", { name: "Remove its books" }).click();

  await expect.element(folders.getByText("2 books added.")).toBeVisible();
  expect(notices.undoOffer).toBeUndefined();
});

test("says when the books of a folder couldn't be removed", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: FOUND_EMPTY,
    removeFolderBooks: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await folders.getByRole("button", { name: "Remove its books" }).click();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent(
      "Couldn't remove the books of Sample Comics. Try again.",
    );
});

test("says when the books of a folder couldn't be put back", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, notices } = await renderSettings({
    rescanFolder: FOUND_EMPTY,
    putBackFolderBooks: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();
  await folders.getByRole("button", { name: "Remove its books" }).click();
  await expect.poll(() => notices.undoOffer).toBeDefined();

  notices.undo();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Couldn't put back the books of Sample Comics.");
});

test("offers to remove the books again once removing them failed", async () => {
  serveFolders([HOME, COMICS]);
  const { folders } = await renderSettings({
    rescanFolder: FOUND_EMPTY,
    removeFolderBooks: () =>
      Promise.resolve({
        status: "error",
        error: { code: "internal", message: "from the backend" },
      }),
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();

  await folders.getByRole("button", { name: "Remove its books" }).click();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent(
      "Couldn't remove the books of Sample Comics. Try again.",
    );
  await expect
    .element(folders.getByRole("button", { name: "Remove its books" }))
    .toBeVisible();
});

test("says when no books were kept to put back", async () => {
  serveFolders([HOME, COMICS]);
  const { folders, notices } = await renderSettings({
    rescanFolder: FOUND_EMPTY,
    putBackFolderBooks: () => Promise.resolve({ status: "ok", data: false }),
  });
  await folders.getByRole("button", { name: "Rescan Sample Comics" }).click();
  await folders.getByRole("button", { name: "Remove its books" }).click();
  await expect.poll(() => notices.undoOffer).toBeDefined();

  notices.undo();

  await expect
    .element(rescanReport(folders))
    .toHaveTextContent("Couldn't put back the books of Sample Comics.");
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
    .toHaveTextContent("Sample Comics Not available /media/Sample Comics");
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
