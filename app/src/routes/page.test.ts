import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

test("shows that the library is empty and how to fill it", async () => {
  const screen = await render(Page);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  const emptyState = screen.getByRole("region", {
    name: "Your library is empty",
  });
  await expect
    .element(
      emptyState.getByText(
        "Add a folder of comics, manga or books. Omnileaf reads it where it is.",
      ),
    )
    .toBeVisible();
  await expect
    .element(emptyState.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});
