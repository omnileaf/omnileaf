import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import AppNavigation from "./AppNavigation.svelte";

const SECTION_LABELS = ["Library", "Browse", "History", "Settings"];

test("links to every section", async () => {
  const screen = await render(AppNavigation, { current: "library" });

  const navigation = screen.getByRole("navigation", { name: "Main" });

  for (const label of SECTION_LABELS) {
    await expect
      .element(navigation.getByRole("link", { name: label }))
      .toBeVisible();
  }
});

test("marks only the current section as the current page", async () => {
  const screen = await render(AppNavigation, { current: "history" });

  await expect
    .element(screen.getByRole("link", { name: "History" }))
    .toHaveAttribute("aria-current", "page");
  for (const label of ["Library", "Browse", "Settings"]) {
    await expect
      .element(screen.getByRole("link", { name: label }))
      .not.toHaveAttribute("aria-current");
  }
});
