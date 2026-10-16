import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

import "../../app.css";

import RemoveFolderDialog from "./RemoveFolderDialog.svelte";

const COMICS: LibraryFolder = {
  id: "2" as LibraryFolder["id"],
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
};
const BOOKS_IN_COMICS = 342;
const FILES_STAY =
  "Its books leave your library. The files stay where they are, and you can add the folder again.";

async function ask(books: number | undefined) {
  const answers = { confirmed: 0, cancelled: 0 };
  await render(RemoveFolderDialog, {
    folder: COMICS,
    books,
    onConfirm: () => {
      answers.confirmed += 1;
    },
    onCancel: () => {
      answers.cancelled += 1;
    },
  });
  const dialog = page.getByRole("alertdialog");
  await expect.element(dialog).toBeVisible();
  return { dialog, answers };
}

test("titles the removal question with a real second-level heading", async () => {
  const { dialog } = await ask(BOOKS_IN_COMICS);

  const title = dialog.getByRole("heading", {
    name: "Remove this folder?",
    level: 2,
  });
  await expect.element(title).toBeVisible();
  expect(title.element().tagName).toBe("H2");
});

test("shows the folder being removed with its location and books", async () => {
  const { dialog } = await ask(BOOKS_IN_COMICS);

  await expect
    .element(dialog.getByText("Sample Comics", { exact: true }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("/media/Sample Comics · 342 books"))
    .toBeVisible();
});

test("says book, not books, for a folder of one", async () => {
  const { dialog } = await ask(1);

  await expect
    .element(dialog.getByText("/media/Sample Comics · 1 book", { exact: true }))
    .toBeVisible();
});

test("shows the folder's location alone while its books are counted", async () => {
  const { dialog } = await ask(undefined);

  await expect
    .element(dialog.getByText("/media/Sample Comics", { exact: true }))
    .toBeVisible();
  await expect.element(dialog).not.toHaveTextContent("·");
});

test("says the folder's files stay where they are", async () => {
  const { dialog } = await ask(BOOKS_IN_COMICS);

  await expect.element(dialog.getByText(FILES_STAY)).toBeVisible();
});

test("names the removal question by its title and describes it by the folder and what happens", async () => {
  const { dialog } = await ask(BOOKS_IN_COMICS);

  await expect.element(dialog).toHaveAccessibleName("Remove this folder?");
  await expect
    .element(dialog)
    .toHaveAccessibleDescription(
      `Sample Comics /media/Sample Comics · 342 books ${FILES_STAY}`,
    );
});

test("marks the removal with a folder-minus badge rather than a bin", async () => {
  const { dialog } = await ask(BOOKS_IN_COMICS);

  const icons = dialog.element().querySelectorAll("svg");
  expect([...icons].map((icon) => icon.classList[1])).toEqual([
    "lucide-folder-minus",
    "lucide-folder",
    "lucide-shield-check",
  ]);
});

test("starts the removal question on Cancel", async () => {
  const { dialog } = await ask(BOOKS_IN_COMICS);

  await expect
    .element(dialog.getByRole("button", { name: "Cancel" }))
    .toHaveFocus();
});

test("answers Remove folder with the folder", async () => {
  const { dialog, answers } = await ask(BOOKS_IN_COMICS);

  await dialog.getByRole("button", { name: "Remove folder" }).click();

  expect(answers).toEqual({ confirmed: 1, cancelled: 0 });
});

test("answers Cancel by keeping the folder", async () => {
  const { dialog, answers } = await ask(BOOKS_IN_COMICS);

  await dialog.getByRole("button", { name: "Cancel" }).click();

  expect(answers).toEqual({ confirmed: 0, cancelled: 1 });
});
