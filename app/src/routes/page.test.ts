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
        appInfo: {
          version: "1.2.3",
          platform: "linux",
          sourceCode: "repo.example.org/omnileaf",
        },
        notices: new Notices(),
      },
      params: {},
    },
  });
}

test("shows that the library is empty and how to fill it", async () => {
  const screen = await renderPage("off");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  const emptyState = screen.getByRole("region", {
    name: "Your library is empty",
  });
  await expect
    .element(
      emptyState.getByText(
        "Add a folder of comics, manga or books. Omnileaf reads it where it is.",
      ),
    )
    .toBeVisible();
  await expect
    .element(emptyState.getByRole("button", { name: "Add a folder" }))
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
