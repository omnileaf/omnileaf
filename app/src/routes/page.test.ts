import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { screenshotModeTurned } from "../../tests/components/screenshot-mode";
import WithScreenshotMode from "../../tests/components/WithScreenshotMode.svelte";
import Page from "./+page.svelte";

test("shows that the library is empty", async () => {
  const screen = await render(WithScreenshotMode, {
    screenshotMode: screenshotModeTurned("off"),
    page: Page,
  });

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Your library is empty."))
    .toBeVisible();
  expect(screen.getByText("Screenshot mode").elements()).toHaveLength(0);
});

test("labels the library while Screenshot mode is on", async () => {
  const screen = await render(WithScreenshotMode, {
    screenshotMode: screenshotModeTurned("on"),
    page: Page,
  });

  await expect.element(screen.getByText("Screenshot mode")).toBeVisible();
});
