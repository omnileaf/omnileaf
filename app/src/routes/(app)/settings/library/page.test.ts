import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ComponentProps } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { screenshotModeTurned } from "../../../../../tests/components/screenshot-mode";
import WithAppContext from "../../../../../tests/components/WithAppContext.svelte";
import Page from "./+page.svelte";

const PageWithAppContext = WithAppContext<ComponentProps<typeof Page>>;

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
  const screen = await render(PageWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: Page,
    pageProps: {},
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
