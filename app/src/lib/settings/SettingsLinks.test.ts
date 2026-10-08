import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import SettingsLinks from "./SettingsLinks.svelte";

test("lists each page with its current value", async () => {
  const screen = await render(SettingsLinks, {
    links: [
      { route: "/(app)/settings/library", label: "Library" },
      {
        route: "/(app)/settings/appearance",
        label: "Appearance",
        value: "Dark",
      },
    ],
  });

  await expect
    .element(screen.getByRole("link", { name: "Library" }))
    .toHaveAttribute("href", "/settings/library");
  await expect
    .element(screen.getByRole("link", { name: "Appearance Dark" }))
    .toHaveAttribute("href", "/settings/appearance");
});
