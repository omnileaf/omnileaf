import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { commands, FolderScan, IpcErrorCode } from "$lib/ipc/bindings";

import AddLibraryFolder from "./AddLibraryFolder.svelte";

type AddFolder = typeof commands.addLibraryFolder;
type AddFolderResult = Awaited<ReturnType<AddFolder>>;

const SAMPLE_SCAN: FolderScan = {
  name: "Sample Library",
  series: 3,
  books: 7,
  unreadableBooks: 0,
  unreadableFolders: 0,
};

function answering(...results: AddFolderResult[]): AddFolder {
  return () => {
    const result = results.shift();
    if (result === undefined) {
      throw new Error("the picker was opened more often than the test expects");
    }
    return Promise.resolve(result);
  };
}

function scanned(scan: Partial<FolderScan>): AddFolderResult {
  return { status: "ok", data: { ...SAMPLE_SCAN, ...scan } };
}

function failed(code: IpcErrorCode): AddFolderResult {
  return { status: "error", error: { code, message: "from the backend" } };
}

const CANCELLED: AddFolderResult = { status: "ok", data: null };

async function renderWith(addFolder: AddFolder) {
  const screen = await render(AddLibraryFolder, { addFolder });
  return {
    button: screen.getByRole("button", { name: "Add a folder" }),
    status: screen.getByRole("status"),
  };
}

test("reports the books and series the scan found in the picked folder", async () => {
  const { button, status } = await renderWith(answering(scanned({})));

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");
});

test("counts a single book in a single series in the singular", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 1, series: 1 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 1 book in 1 series in Sample Library.");
});

test("formats the book count for the locale", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 1234 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 1,234 books in 3 series in Sample Library.");
});

test("says so when the folder holds no books", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 0, series: 0 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found no books in Sample Library.");
});

test("mentions the books and folders inside it that couldn't be read", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ unreadableBooks: 1, unreadableFolders: 2 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent(
      "Found 7 books in 3 series in Sample Library. Couldn't read 1 book in it. Couldn't read 2 folders inside it.",
    );
});

test("clears the last result when the picker is cancelled", async () => {
  const { button, status } = await renderWith(
    answering(scanned({}), CANCELLED),
  );
  await button.click();
  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");

  await button.click();

  await expect.element(status).toHaveTextContent("");
});

test.each<[IpcErrorCode, string]>([
  ["folderUnreadable", "Couldn't read that folder."],
  [
    "folderPickerUnavailable",
    "Adding folders isn't available on this device yet.",
  ],
  ["internal", "Something went wrong while adding the folder. Try again."],
])("explains a %s failure", async (code, explanation) => {
  const { button, status } = await renderWith(answering(failed(code)));

  await button.click();

  await expect.element(status).toHaveTextContent(explanation);
});

test("disables the button while the folder is being added", async () => {
  let answer: (result: AddFolderResult) => void = () => undefined;
  const { button } = await renderWith(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );

  await button.click();
  await expect.element(button).toBeDisabled();
  answer(CANCELLED);

  await expect.element(button).toBeEnabled();
});
