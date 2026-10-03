import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import SettingsIndex from "./SettingsIndex.svelte";

const PROPS = {
  summaries: {
    "/settings/appearance": { text: "Follows the system" },
    "/settings/about": { text: "Version 1.2.3" },
  },
};

function groupHolding(name: string) {
  return page
    .getByRole("list")
    .filter({ has: page.getByRole("link", { name: new RegExp(`^${name}`) }) });
}

test("groups Library, Appearance and General together", async () => {
  await render(SettingsIndex, PROPS);

  const group = groupHolding("Library");

  for (const name of ["Appearance", "General"]) {
    await expect
      .element(group.getByRole("link", { name: new RegExp(`^${name}`) }))
      .toBeVisible();
  }
  expect(group.getByRole("listitem").elements()).toHaveLength(3);
});

test("keeps About in a group of its own", async () => {
  await render(SettingsIndex, PROPS);

  const group = groupHolding("About");

  await expect.element(group).toBeVisible();
  expect(group.getByRole("listitem").elements()).toHaveLength(1);
});

test("shows a section's summary under its name", async () => {
  const screen = await render(SettingsIndex, PROPS);

  await expect
    .element(
      screen
        .getByRole("link", { name: /^Appearance/ })
        .getByText("Follows the system"),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("link", { name: /^About/ }).getByText("Version 1.2.3"),
    )
    .toBeVisible();
});

test("names a section without a summary by its title alone", async () => {
  const screen = await render(SettingsIndex, PROPS);

  await expect
    .element(screen.getByRole("link", { name: "Library", exact: true }))
    .toBeVisible();
});
