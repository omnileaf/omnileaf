import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { Notices } from "$lib/notices/notices.svelte";

import Page from "./+page.svelte";

test("shows that the library is empty", async () => {
  const screen = await render(Page, {
    data: {
      appInfo: { version: "1.2.3", platform: "linux" },
      notices: new Notices(),
    },
    params: {},
  });

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Your library is empty."))
    .toBeVisible();
});
