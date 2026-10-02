import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

const PROPS = {
  data: { appInfo: { version: "1.2.3", platform: "linux" as const } },
  params: {},
};

const ABOUT = { name: /^About/ };

test("shows the app version under About", async () => {
  const screen = await render(Page, PROPS);

  await expect
    .element(screen.getByRole("link", ABOUT).getByText("Version 1.2.3"))
    .toBeVisible();
});

test("keeps About in a group of its own", async () => {
  const screen = await render(Page, PROPS);

  const group = screen.getByRole("link", ABOUT).element().closest("ul");

  expect(group?.querySelectorAll("a")).toHaveLength(1);
});
