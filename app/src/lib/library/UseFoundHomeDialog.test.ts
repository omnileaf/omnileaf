import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { FoundHome } from "./home-folder-change.svelte";
import UseFoundHomeDialog from "./UseFoundHomeDialog.svelte";

const FOUND: FoundHome = {
  location: "/media/Sample Library",
  library: {
    series: 212,
    books: 1,
    lastBackupAtMs: Date.UTC(2026, 9, 12, 9),
  },
};

async function offer(found: FoundHome) {
  const answers = { used: 0, cancelled: 0 };
  await render(UseFoundHomeDialog, {
    found,
    isBusy: false,
    onUse: () => {
      answers.used += 1;
    },
    onCancel: () => {
      answers.cancelled += 1;
    },
  });
  const dialog = page.getByRole("alertdialog");
  await expect.element(dialog).toBeVisible();
  return { dialog, answers };
}

test("shows the chosen folder with what its library holds", async () => {
  const { dialog } = await offer(FOUND);

  await expect
    .element(dialog.getByText("/media/Sample Library", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText("212 series · 1 book · Last backup October 12, 2026"),
    )
    .toBeVisible();
});

test("says Omnileaf restarts with it and the current library stays", async () => {
  const { dialog } = await offer(FOUND);

  await expect
    .element(
      dialog.getByText(
        "Omnileaf restarts with it. Your current library stays where it is.",
      ),
    )
    .toBeVisible();
});

test("uses the library with Use this library", async () => {
  const { dialog, answers } = await offer(FOUND);

  await dialog.getByRole("button", { name: "Use this library" }).click();

  expect(answers).toEqual({ used: 1, cancelled: 0 });
});

test("turns the library down with Cancel", async () => {
  const { dialog, answers } = await offer(FOUND);

  await dialog.getByRole("button", { name: "Cancel" }).click();

  expect(answers).toEqual({ used: 0, cancelled: 1 });
});
