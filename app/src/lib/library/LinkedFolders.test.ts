import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { FolderAdding } from "./folder-adding.svelte";
import { LibraryFolders } from "./library-folders.svelte";
import LinkedFolders from "./LinkedFolders.svelte";

const COMICS: LibraryFolder = {
  id: "2" as LibraryFolder["id"],
  kind: "linked",
  name: "Sample Comics",
  location: "/media/Sample Comics",
  isAvailable: true,
};

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

async function renderFirstLaunchListOnIphone() {
  await page.viewport(390, 844);
  followCorePlatform("ios");
  const notices = new Notices();
  const folders = new LibraryFolders(
    () =>
      Promise.resolve({
        status: "ok",
        data: { folders: [COMICS], next: null },
      }),
    () => Promise.resolve({ status: "ok", data: null }),
    () => Promise.resolve({ status: "ok", data: 0 }),
  );
  await folders.load();
  const screen = await render(LinkedFolders, {
    platform: "ios",
    folders,
    adding: new FolderAdding(
      () => Promise.resolve({ status: "ok", data: null }),
      () => notices,
    ),
    notices,
    usesStandIns: false,
    addPlacement: "below-list",
  });
  return screen.getByRole("region", { name: "Folders" });
}

test("keeps Remove as an icon on the row, with no swipe layers, in the first launch's list on an iPhone", async () => {
  const folders = await renderFirstLaunchListOnIphone();

  const remove = folders.getByRole("button", { name: "Remove Sample Comics" });
  await expect.element(remove).toBeVisible();

  expect({
    text: remove.element().textContent.trim(),
    hasSwipeLayers: folders.element().querySelector("[data-swiped]") !== null,
  }).toEqual({ text: "", hasSwipeLayers: false });
});
