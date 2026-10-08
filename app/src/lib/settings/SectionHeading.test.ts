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

test("links back to the page it sits under", async () => {
  const screen = await render(SectionHeading, {
    title: "Language",
    parent: { route: "/(app)/settings/general", title: "General" },
  });

  const back = screen.getByRole("link", { name: "Back to General" });

  await expect.element(back).toHaveAttribute("href", "/settings/general");
  await expect.element(back).toHaveTextContent("General");
});
