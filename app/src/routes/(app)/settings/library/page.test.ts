import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ComponentProps } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
import { screenshotModeTurned } from "../../../../../tests/components/screenshot-mode";
import WithAppContext from "../../../../../tests/components/WithAppContext.svelte";
import Page from "./+page.svelte";

const PageWithAppContext = WithAppContext<ComponentProps<typeof Page>>;

beforeEach(() => {
  mockIPC((command) => {
    if (command === "library_adult_content") {
      return NEW_ADULT_CONTENT;
    }
    if (command === "library_tags") {
      return [];
    }
    if (command !== "library_folders") {
      throw new Error(`the test serves no command \`${command}\``);
    }
    return { folders: [], next: null };
  });
});

afterEach(() => {
  clearMocks();
});

test("offers to add a folder", async () => {
  const screen = await render(PageWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: Page,
    pageProps: {
      params: {},
      data: {
        appInfo: {
          version: "1.2.3",
          platform: "linux",
          sourceCode: "repo.example.org/omnileaf",
          isDevelopmentBuild: false,
        },
        libraryProblem: null,
        homeArrival: null,
        isFirstLaunch: false,
      },
    },
  });

  const folders = screen.getByRole("region", { name: "Folders" });

  await expect
    .element(folders.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});
