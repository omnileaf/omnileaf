import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import SectionHeading from "./SectionHeading.svelte";

const PROPS = { title: "About" };
const EXPANDED_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

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

test("hides the way back to settings beside the list of sections", async () => {
  await page.viewport(EXPANDED_WIDTH, VIEWPORT_HEIGHT);
  const screen = await render(SectionHeading, PROPS);

  await expect
    .element(
      screen.getByRole("link", {
        name: "Back to Settings",
        includeHidden: true,
      }),
    )
    .not.toBeVisible();
});

test("keeps the way back to the page it sits under beside the list of sections", async () => {
  await page.viewport(EXPANDED_WIDTH, VIEWPORT_HEIGHT);
  const screen = await render(SectionHeading, {
    title: "Screenshot mode",
    parent: { route: "/(app)/settings/privacy", title: "Privacy and security" },
  });

  await expect
    .element(screen.getByRole("link", { name: "Back to Privacy and security" }))
    .toBeVisible();
});
