import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import UnsupportedFileDialog from "./UnsupportedFileDialog.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

test("tells the person the file type is not supported, with one way to dismiss it", async () => {
  followCorePlatform("android");
  const onClose = vi.fn();
  await render(UnsupportedFileDialog, { isOpen: true, onClose });

  const dialog = page.getByRole("alertdialog");
  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Omnileaf can't open this file"))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText("This file type isn't supported", { exact: false }),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button")).toHaveLength(1);

  await dialog.getByRole("button", { name: "OK" }).click();

  expect(onClose).toHaveBeenCalledOnce();
});
