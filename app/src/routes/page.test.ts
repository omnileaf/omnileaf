import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

test("shows that the library is empty", async () => {
  const screen = await render(Page);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Your library is empty."))
    .toBeVisible();
});
