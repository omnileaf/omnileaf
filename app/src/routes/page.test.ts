import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

const PROPS = { data: { appInfo: { version: "1.2.3" } }, params: {} };

test("shows that the library is empty", async () => {
  const screen = await render(Page, PROPS);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Your library is empty."))
    .toBeVisible();
});

test("shows the app version it was given", async () => {
  const screen = await render(Page, PROPS);

  await expect.element(screen.getByText("Version 1.2.3")).toBeVisible();
});
