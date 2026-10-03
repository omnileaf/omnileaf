import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

test("explains that folders stay where they are", async () => {
  const screen = await render(Page);

  const folders = screen.getByRole("region", { name: "Folders" });

  await expect
    .element(
      folders.getByText(
        "Folders of comics, manga or books. Omnileaf reads them where they are.",
      ),
    )
    .toBeVisible();
  await expect
    .element(folders.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});
