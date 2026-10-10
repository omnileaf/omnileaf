import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import SettingsIndex from "./SettingsIndex.svelte";

const PROPS = {
  summaries: {
    "/(app)/settings/appearance": { text: "Follows the system" },
    "/(app)/settings/about": { text: "Version 1.2.3" },
  },
};

function groupHolding(name: string) {
  return page
    .getByRole("list")
    .filter({ has: page.getByRole("link", { name: new RegExp(`^${name}`) }) });
}

test("groups Library, Appearance, Privacy and security and General together", async () => {
  await render(SettingsIndex, PROPS);

  const group = groupHolding("Library");

  for (const name of ["Appearance", "Privacy and security", "General"]) {
    await expect
      .element(group.getByRole("link", { name: new RegExp(`^${name}`) }))
      .toBeVisible();
  }
  expect(group.getByRole("listitem").elements()).toHaveLength(4);
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

test("lists Advanced above About", async () => {
  await render(SettingsIndex, PROPS);

  const group = groupHolding("About");
  const links = group.getByRole("link");

  await expect.element(links.nth(0)).toHaveAccessibleName("Advanced");
  await expect.element(links.nth(1)).toHaveAccessibleName(/^About/);
  expect(links.elements()).toHaveLength(2);
});
