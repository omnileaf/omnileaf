import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import NewCategoryDialog from "./NewCategoryDialog.svelte";
import RenameTagDialog from "./RenameTagDialog.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

function namesOfButtons(): readonly string[] {
  return page
    .getByRole("dialog")
    .element()
    .querySelectorAll("button")
    .values()
    .map((button) => button.textContent.trim())
    .filter((name) => name !== "")
    .toArray();
}

const DIALOGS = [
  {
    name: "new category",
    show: () =>
      render(NewCategoryDialog, {
        props: {
          isOpen: true,
          onAdd: () => undefined,
          onClose: () => undefined,
        },
      }),
    action: "Add",
  },
  {
    name: "rename tag",
    show: () =>
      render(RenameTagDialog, {
        props: {
          tag: "Harbour",
          onRename: () => undefined,
          onClose: () => undefined,
        },
      }),
    action: "Rename",
  },
] as const;

for (const { name, show, action } of DIALOGS) {
  test(`puts the ${name} dialog's action before Cancel on Windows`, async () => {
    followCorePlatform("windows");
    await page.viewport(1280, 800);
    await show();

    expect(namesOfButtons()).toEqual([action, "Cancel"]);
  });

  test(`keeps Cancel before the ${name} dialog's action on macOS`, async () => {
    followCorePlatform("macos");
    await page.viewport(1280, 800);
    await show();

    expect(namesOfButtons()).toEqual(["Cancel", action]);
  });
}
