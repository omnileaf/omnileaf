import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ComponentProps } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { Notices } from "$lib/notices/notices.svelte";

import { screenshotModeTurned } from "../../../../../tests/components/screenshot-mode";
import WithScreenshotMode from "../../../../../tests/components/WithScreenshotMode.svelte";
import Page from "./+page.svelte";

const PageWithScreenshotMode = WithScreenshotMode<ComponentProps<typeof Page>>;

beforeEach(() => {
  mockIPC((command) => {
    if (command !== "library_folders") {
      throw new Error(`the test serves no command \`${command}\``);
    }
    return { folders: [], next: null };
  });
});

afterEach(() => {
  clearMocks();
});

test("explains that folders stay where they are", async () => {
  const screen = await render(PageWithScreenshotMode, {
    screenshotMode: screenshotModeTurned("off"),
    page: Page,
    pageProps: {
      data: {
        appInfo: {
          version: "1.2.3",
          platform: "linux",
          sourceCode: "repo.example.org/omnileaf",
        },
        isFirstLaunch: false,
        libraryProblem: null,
        notices: new Notices(),
      },
      params: {},
    },
  });

  const folders = screen.getByRole("region", { name: "Folders" });

  await expect
    .element(
      folders.getByText(
        "Folders of comics, manga or books. Omnileaf reads them where they are.",
      ),
    )
    .toBeVisible();
  await expect
    .element(folders.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});
