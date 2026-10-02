import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { commands, FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";
import NoticeHost from "$lib/notices/NoticeHost.svelte";
import { Notices } from "$lib/notices/notices.svelte";

import AddLibraryFolder from "./AddLibraryFolder.svelte";

type AddFolder = typeof commands.addLibraryFolder;
type AddFolderResult = Awaited<ReturnType<AddFolder>>;

const SAMPLE_SURVEY: FolderSurvey = {
  name: "Sample Library",
  comicFiles: 3,
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

function found(survey: Partial<FolderSurvey>): AddFolderResult {
  return { status: "ok", data: { ...SAMPLE_SURVEY, ...survey } };
}

function failed(code: IpcErrorCode): AddFolderResult {
  return { status: "error", error: { code, message: "from the backend" } };
}

const CANCELLED: AddFolderResult = { status: "ok", data: null };

async function renderWith(addFolder: AddFolder) {
  const notices = new Notices();
  const screen = await render(AddLibraryFolder, { addFolder, notices });
  await render(NoticeHost, { notices });
  return {
    notices,
    button: screen.getByRole("button", { name: "Add a folder" }),
    status: page.elementLocator(screen.container).getByRole("status"),
  };
}

test("reports how many comics the picked folder holds", async () => {
  const { button, status } = await renderWith(answering(found({})));

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 3 comics in Sample Library.");
});

test("counts a single comic in the singular", async () => {
  const { button, status } = await renderWith(
    answering(found({ comicFiles: 1 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 1 comic in Sample Library.");
});

test("formats the comic count for the locale", async () => {
  const { button, status } = await renderWith(
    answering(found({ comicFiles: 1234 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 1,234 comics in Sample Library.");
});

test("mentions the folders inside it that couldn't be read", async () => {
  const { button, status } = await renderWith(
    answering(found({ unreadableFolders: 2 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent(
      "Found 3 comics in Sample Library. Couldn't read 2 folders inside it.",
    );
});

test("clears the last result when the picker is cancelled", async () => {
  const { button, status } = await renderWith(answering(found({}), CANCELLED));
  await button.click();
  await expect
    .element(status)
    .toHaveTextContent("Found 3 comics in Sample Library.");

  await button.click();

  await expect.element(status).toHaveTextContent("");
});

test.each<[IpcErrorCode, string, string]>([
  [
    "folderUnreadable",
    "Couldn't read that folder",
    "Omnileaf may not be allowed to open it, or it may have moved. Your library hasn't changed.",
  ],
  [
    "folderPickerUnavailable",
    "Adding folders isn't available on this device yet",
    "It's coming in a later version of Omnileaf.",
  ],
  [
    "internal",
    "Couldn't add the folder",
    "Something went wrong inside Omnileaf. Your library hasn't changed.",
  ],
])("warns when adding fails with %s", async (code, title, body) => {
  const { notices, button } = await renderWith(answering(failed(code)));

  await button.click();

  await expect
    .poll(() => notices.shown)
    .toMatchObject({ tone: "warning", title, body });
});

test.each<[IpcErrorCode, string]>([
  ["folderUnreadable", "Choose another folder"],
  ["internal", "Try again"],
])("opens the picker again from the %s warning", async (code, retry) => {
  const { status, button } = await renderWith(
    answering(failed(code), found({})),
  );
  await button.click();

  await page.getByRole("button", { name: retry }).click();

  await expect
    .element(status)
    .toHaveTextContent("Found 3 comics in Sample Library.");
});

test("offers no retry when the device has no folder picker", async () => {
  const { notices, button } = await renderWith(
    answering(failed("folderPickerUnavailable")),
  );

  await button.click();

  await expect.poll(() => notices.shown?.actions).toEqual([]);
});

test("puts a failure warning away once a folder is added", async () => {
  const { notices, button, status } = await renderWith(
    answering(failed("folderUnreadable"), found({})),
  );
  await button.click();
  await expect.poll(() => notices.shown).toBeDefined();

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 3 comics in Sample Library.");
  expect(notices.shown).toBeUndefined();
});

test("disables the button while the picker is open", async () => {
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
