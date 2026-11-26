import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import RenameCategoryDialog from "./RenameCategoryDialog.svelte";

const OTHERS = ["Reading", "Manga"];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

async function showFor(name: string, onRename = vi.fn()) {
  await render(RenameCategoryDialog, {
    props: { name, otherNames: OTHERS, onRename, onClose: () => undefined },
  });
  return onRename;
}

function nameField() {
  return page.getByRole("textbox", { name: "Name" });
}

function renameButton() {
  return page.getByRole("button", { name: "Rename", exact: true });
}

test("opens on the category's name under Rename category", async () => {
  followCorePlatform("linux");
  await showFor("Plan to read");

  await expect
    .element(page.getByRole("dialog", { name: "Rename category" }))
    .toBeVisible();
  await expect.element(nameField()).toHaveValue("Plan to read");
});

test("renames to the name typed, without its outer spaces", async () => {
  followCorePlatform("linux");
  const onRename = await showFor("Plan to read");

  await nameField().fill("  Later ");
  await renameButton().click();

  expect(onRename).toHaveBeenCalledWith("Later");
});

test("refuses another category's name with a reason under the field and keeps Rename off", async () => {
  followCorePlatform("android");
  const onRename = await showFor("Plan to read");

  await nameField().fill("manga");
  await userEvent.keyboard("{Enter}");

  const reason = page.getByText("manga is already a category.");
  await expect.element(reason).toBeVisible();
  await expect.element(nameField()).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(nameField())
    .toHaveAccessibleDescription("manga is already a category.");
  await expect.element(renameButton()).toHaveAttribute("aria-disabled", "true");
  expect(onRename).not.toHaveBeenCalled();
});

test("refuses an empty name", async () => {
  followCorePlatform("ios");
  const onRename = await showFor("Plan to read");

  await nameField().fill("   ");
  await renameButton().click({ force: true });

  await expect.element(page.getByText("Enter a name.")).toBeVisible();
  expect(onRename).not.toHaveBeenCalled();
});

test("draws the name in an outlined field on Android", async () => {
  followCorePlatform("android");
  await showFor("Plan to read");

  expect(
    nameField().element().closest('[data-slot="outlined-field"]'),
  ).not.toBeNull();
});
