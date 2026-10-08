import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import type { ComponentProps } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-svelte";

import {
  DEFAULT_LIBRARY_VIEW,
  events,
  type LibrarySeries,
} from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.svelte.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode";
import WithScreenshotMode from "../../../tests/components/WithScreenshotMode.svelte";
import Page from "./+page.svelte";

const PageWithScreenshotMode = WithScreenshotMode<ComponentProps<typeof Page>>;

const COVER = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1";
const EMPTY_LIBRARY = "Your library is empty";

type WireSeries = Omit<LibrarySeries, "id" | "cover"> & {
  readonly id: string;
  readonly cover: string | null;
};

const SAMPLE_SERIES: WireSeries = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Sample Series 01",
  bookCount: 3,
  unreadCount: 3,
  cover: COVER,
};

/** Lets a closed page stop listening, which it does once a promise settles, before the mocks it stops through go. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

/** Lists whatever `catalog` holds when asked, counting how often the page asked, and draws the library as a new one is drawn. */
function listing(catalog: () => readonly WireSeries[]): { asked: number } {
  const counted = { asked: 0 };
  mockIPC(
    (command) => {
      if (command === "library_view") {
        return DEFAULT_LIBRARY_VIEW;
      }
      if (command !== "library_series") {
        throw new Error(`the page called \`${command}\``);
      }
      counted.asked += 1;
      return { series: catalog(), next: null };
    },
    { shouldMockEvents: true },
  );
  return counted;
}

beforeEach(() => {
  listing(() => []);
});

afterEach(async () => {
  cleanup();
  await settled();
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
          isDevelopmentBuild: false,
        },
        isFirstLaunch: false,
        libraryProblem: null,
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

test("offers to add a folder beside the title once the library has series", async () => {
  mockConvertFileSrc("linux");
  listing(() => [SAMPLE_SERIES]);

  const screen = await renderPage("off");

  await expect
    .element(screen.getByRole("list", { name: "Series" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Add a folder" }))
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
  mockIPC(
    (command) => {
      if (command === "library_view") {
        return DEFAULT_LIBRARY_VIEW;
      }
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
      throw {
        code: "internal",
        message: "something went wrong inside the app",
      };
    },
    { shouldMockEvents: true },
  );

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
  listing(() => [SAMPLE_SERIES]);

  const screen = await renderPage("off");

  const series = screen.getByRole("list", { name: "Series" });
  await expect
    .element(series.getByRole("presentation"))
    .toHaveAttribute("src", `omni://localhost/${COVER}`);
  expect(
    screen.getByRole("region", { name: EMPTY_LIBRARY }).elements(),
  ).toHaveLength(0);
});

test("shows the series the library gains once it says it changed", async () => {
  mockConvertFileSrc("linux");
  let catalog: readonly WireSeries[] = [];
  listing(() => catalog);
  const screen = await renderPage("off");
  await expect
    .element(screen.getByRole("region", { name: EMPTY_LIBRARY }))
    .toBeVisible();
  catalog = [SAMPLE_SERIES];

  await events.libraryChanged.emit();

  await expect
    .element(
      screen
        .getByRole("list", { name: "Series" })
        .getByText("Sample Series 01"),
    )
    .toBeVisible();
});

test("stops reading the series again once the page has closed", async () => {
  const counted = listing(() => []);
  const screen = await renderPage("off");
  await expect
    .element(screen.getByRole("region", { name: EMPTY_LIBRARY }))
    .toBeVisible();
  await expect.poll(() => counted.asked).toBe(1);
  await screen.unmount();

  await events.libraryChanged.emit();

  expect(counted.asked).toBe(1);
});
