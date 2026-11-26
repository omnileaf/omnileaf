import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import type { AddFolder } from "./add-folder";
import AddFolderButton from "./AddFolderButton.svelte";
import { FolderAdding } from "./folder-adding.svelte";

const PHONE = { width: 412, height: 915 };

const neverFinishes: AddFolder = () => new Promise(() => undefined);

async function renderAddingFolder(platform: Platform): Promise<HTMLElement> {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  const notices = new Notices();
  const adding = new FolderAdding(neverFinishes, () => notices);
  await render(AddFolderButton, { adding, placement: "empty-state" });
  const button = page.getByRole("button", { name: "Add a folder" });
  await button.click();
  await expect.element(button).toBeDisabled();
  const element = button.element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the add a folder button drew no element");
  }
  for (const animation of element.getAnimations()) {
    animation.finish();
  }
  return element;
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("greys Android's disabled Add a folder button only the kit's way, without dimming it further", async () => {
  const button = await renderAddingFolder("android");

  const style = getComputedStyle(button);

  expect(style.opacity).toBe("1");
  expect(style.color).toBe("rgba(44, 53, 46, 0.38)");
  expect(style.backgroundColor).toBe("rgba(44, 53, 46, 0.1)");
});

test("keeps iOS's disabled Add a folder button dimmed as before", async () => {
  const button = await renderAddingFolder("ios");

  expect(getComputedStyle(button).opacity).toBe("0.6");
});
