import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";

import AddFolderButton from "./AddFolderButton.svelte";
import { type AddFolder, FolderAdding } from "./folder-adding.svelte";
import FolderNotice from "./FolderNotice.svelte";

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
  const adding = new FolderAdding(addFolder);
  await render(AddFolderButton, { adding, placement: "empty-state" });
  await render(FolderNotice, { adding });
  return {
    button: page.getByRole("button", { name: "Add a folder" }),
    status: page.getByRole("status"),
    alert: page.getByRole("alert"),
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

test("clears the result when it is dismissed", async () => {
  const { button, status } = await renderWith(answering(found({})));
  await button.click();
  await expect
    .element(status)
    .toHaveTextContent("Found 3 comics in Sample Library.");

  await status.getByRole("button", { name: "Dismiss" }).click();

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
  const { button, status, alert } = await renderWith(answering(failed(code)));

  await button.click();

  await expect.element(alert).toHaveTextContent(explanation);
  await expect.element(status).toHaveTextContent("");
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
