import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import type { ComponentProps } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { Notices } from "$lib/notices/notices.svelte";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode";
import WithScreenshotMode from "../../../tests/components/WithScreenshotMode.svelte";
import Page from "./+page.svelte";

const PageWithScreenshotMode = WithScreenshotMode<ComponentProps<typeof Page>>;

const COVER = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1";
const EMPTY_LIBRARY = "Your library is empty";

function listing(series: readonly unknown[]): void {
  mockIPC((command) => {
    if (command !== "library_series") {
      throw new Error(`the page called \`${command}\``);
    }
    return { series, next: null };
  });
}

beforeEach(() => {
  listing([]);
});

afterEach(() => {
  clearMocks();
});

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
        isFirstLaunch: false,
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

test("says when the library's series can't be listed", async () => {
  mockIPC(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
    throw { code: "internal", message: "something went wrong inside the app" };
  });

  const screen = await renderPage("off");

  await expect
    .element(screen.getByText("Couldn't load your library. Try again later."))
    .toBeVisible();
  expect(
    screen.getByRole("region", { name: EMPTY_LIBRARY }).elements(),
  ).toHaveLength(0);
});

test("shows the covers of the library's series once it has some", async () => {
  mockConvertFileSrc("linux");
  listing([
    {
      id: "0190a3e4-0000-8000-8000-0000000000a1",
      title: "Sample Series 01",
      bookCount: 3,
      cover: COVER,
    },
  ]);

  const screen = await renderPage("off");

  const series = screen.getByRole("list", { name: "Series" });
  await expect
    .element(series.getByRole("presentation"))
    .toHaveAttribute("src", `omni://localhost/${COVER}`);
  expect(
    screen.getByRole("region", { name: EMPTY_LIBRARY }).elements(),
  ).toHaveLength(0);
});
