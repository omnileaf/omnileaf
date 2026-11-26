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

test("fills Rename in the accent on an iPhone, apart from Cancel", async () => {
  await page.viewport(390, 844);
  followCorePlatform("ios");
  await showFor("Plan to read");

  const rename = getComputedStyle(renameButton().element());
  const cancel = getComputedStyle(
    page.getByRole("button", { name: "Cancel" }).element(),
  );

  expect(rename.backgroundColor).not.toBe(cancel.backgroundColor);
  expect(rename.color).not.toBe(cancel.color);
});

test("greys out Rename on an Android phone while the name is refused", async () => {
  await page.viewport(390, 844);
  followCorePlatform("android");
  await showFor("Plan to read");
  const offered = getComputedStyle(renameButton().element()).color;

  await nameField().fill("Manga");

  await expect
    .poll(() => getComputedStyle(renameButton().element()).color)
    .not.toBe(offered);
});

test("shows the core's refusal of a name the dialog's own check lets through", async () => {
  followCorePlatform("linux");
  await render(RenameCategoryDialog, {
    props: {
      name: "Plan to read",
      otherNames: ["Strasse"],
      refused: { name: "Straße", problem: "taken" },
      onRename: () => undefined,
      onClose: () => undefined,
    },
  });

  await nameField().fill("Straße");

  await expect
    .element(page.getByText("Straße is already a category."))
    .toBeVisible();
  await expect.element(renameButton()).toHaveAttribute("aria-disabled", "true");
  await nameField().fill("Strassen");
  await expect.element(renameButton()).not.toHaveAttribute("aria-disabled");
});

test("sends no second rename while the first is still on its way", async () => {
  followCorePlatform("linux");
  const onRename = vi.fn();
  await render(RenameCategoryDialog, {
    props: {
      name: "Plan to read",
      otherNames: OTHERS,
      isBusy: true,
      onRename,
      onClose: () => undefined,
    },
  });

  await nameField().fill("Later");
  await userEvent.keyboard("{Enter}");

  expect(onRename).not.toHaveBeenCalled();
  await expect.element(renameButton()).toHaveAttribute("aria-disabled", "true");
});

for (const [closing, otherNames] of [
  ["Cancel", [...OTHERS, "Plan to read"]],
  ["a rename", [...OTHERS, "Later"]],
] as const) {
  test(`keeps the name and no reason in the field as it fades out after ${closing}`, async () => {
    followCorePlatform("linux");
    const screen = await render(RenameCategoryDialog, {
      props: {
        name: "Plan to read",
        otherNames: OTHERS,
        onRename: () => undefined,
        onClose: () => undefined,
      },
    });
    await nameField().fill("Later");

    await screen.rerender({ name: undefined, otherNames });

    const field = document.querySelector("input");
    expect(field).not.toBeNull();
    expect(field?.value).not.toBe("");
    expect(field?.getAttribute("aria-invalid")).not.toBe("true");
    expect(document.body.textContent).not.toContain("Enter a name.");
    expect(document.body.textContent).not.toContain("is already a category");
  });
}
