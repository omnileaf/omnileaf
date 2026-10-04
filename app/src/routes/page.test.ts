import type { ComponentProps } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { Notices } from "$lib/notices/notices.svelte";

import { screenshotModeTurned } from "../../tests/components/screenshot-mode";
import WithScreenshotMode from "../../tests/components/WithScreenshotMode.svelte";
import Page from "./+page.svelte";

const PageWithScreenshotMode = WithScreenshotMode<ComponentProps<typeof Page>>;

function renderPage(screenshotMode: "on" | "off") {
  return render(PageWithScreenshotMode, {
    screenshotMode: screenshotModeTurned(screenshotMode),
    page: Page,
    pageProps: {
      data: {
        appInfo: { version: "1.2.3", platform: "linux" },
        notices: new Notices(),
      },
      params: {},
    },
  });
}

test("shows that the library is empty", async () => {
  const screen = await renderPage("off");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Your library is empty."))
    .toBeVisible();
});

test("leaves the library unlabelled while Screenshot mode is off", async () => {
  const screen = await renderPage("off");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();

  expect(screen.getByText("Screenshot mode").elements()).toHaveLength(0);
});

test("labels the library while Screenshot mode is on", async () => {
  const screen = await renderPage("on");

  await expect.element(screen.getByText("Screenshot mode")).toBeVisible();
});
