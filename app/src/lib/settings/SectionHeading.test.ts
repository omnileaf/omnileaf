import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import SectionHeading from "./SectionHeading.svelte";

const PROPS = { title: "About" };

test("titles the page", async () => {
  const screen = await render(SectionHeading, PROPS);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "About" }))
    .toBeVisible();
});

test("links back to settings", async () => {
  const screen = await render(SectionHeading, PROPS);

  await expect
    .element(screen.getByRole("link", { name: "Back to Settings" }))
    .toHaveAttribute("href", "/settings");
});
