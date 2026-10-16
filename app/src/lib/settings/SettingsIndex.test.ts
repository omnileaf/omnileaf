import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import SettingsIndex from "./SettingsIndex.svelte";

const PROPS = {
  summaries: {
    "/(app)/settings/appearance": { text: "Follows the system" },
    "/(app)/settings/about": { text: "Version 1.2.3" },
  },
};

test("groups the pages under App, Reading and Data and privacy, as the Settings list draws them", async () => {
  const screen = await render(SettingsIndex, PROPS);

  const named = (group: string) =>
    screen
      .getByRole("list", { name: group })
      .getByRole("link")
      .elements()
      .map((link) =>
        link.querySelector("[data-slot=item-title]")?.textContent.trim(),
      );

  expect([named("App"), named("Reading"), named("Data and privacy")]).toEqual([
    ["General", "Appearance"],
    ["Library", "Reader"],
    ["Privacy and security", "Storage", "Advanced"],
  ]);
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

test("lists About on its own, last", async () => {
  const screen = await render(SettingsIndex, PROPS);

  const lists = screen.getByRole("list").elements();
  const last = lists.at(-1);

  expect(last?.querySelectorAll("a")).toHaveLength(1);
  expect(last?.textContent).toContain("About");
});
