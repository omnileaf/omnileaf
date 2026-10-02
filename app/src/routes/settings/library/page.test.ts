import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

test("explains that folders stay where they are", async () => {
  const screen = await render(Page);

  const folders = screen.getByRole("region", { name: "Folders" });

  await expect
    .element(
      folders.getByText(
        "Omnileaf reads these folders where they are and never changes them.",
      ),
    )
    .toBeVisible();
  await expect
    .element(folders.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});
