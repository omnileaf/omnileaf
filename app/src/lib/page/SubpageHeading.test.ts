import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import SubpageHeading from "./SubpageHeading.svelte";

const PROPS = {
  title: "About",
  parentTitle: "Settings",
  parentRoute: "/settings" as const,
};

test("titles the page", async () => {
  const screen = await render(SubpageHeading, PROPS);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "About" }))
    .toBeVisible();
});

test("links back to the page it belongs to", async () => {
  const screen = await render(SubpageHeading, PROPS);

  await expect
    .element(screen.getByRole("link", { name: "Back to Settings" }))
    .toHaveAttribute("href", "/settings");
});
