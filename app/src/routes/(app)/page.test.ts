import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

const COVER = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1";
const LIBRARY_CHANGED = "library-changed";

interface WireSeries {
  readonly id: string;
  readonly title: string;
  readonly bookCount: number;
  readonly cover: string | null;
}

const SAMPLE_SERIES: WireSeries = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Sample Series 01",
  bookCount: 3,
  cover: COVER,
};

/** Lets a closed page stop listening, which it does once a promise settles, before the mocks it stops through go. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

afterEach(async () => {
  cleanup();
  await settled();
  clearMocks();
});

/** Lists whatever `catalog` holds when asked, counting how often the page asked. */
function listing(catalog: () => readonly WireSeries[]): { asked: number } {
  const counted = { asked: 0 };
  mockIPC(
    (command) => {
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

test("shows the empty library with a way to add a folder", async () => {
  listing(() => []);

  const screen = await render(Page);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  const empty = screen.getByRole("region", { name: "Your library is empty" });
  await expect
    .element(
      empty.getByText(
        "Add a folder of comics, manga or books. Omnileaf reads it where it is.",
      ),
    )
    .toBeVisible();
  await expect
    .element(empty.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});

test("offers to add a folder beside the title once the library has series", async () => {
  mockConvertFileSrc("linux");
  listing(() => [SAMPLE_SERIES]);

  const screen = await render(Page);

  await expect
    .element(screen.getByRole("list", { name: "Series" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Add a folder" }))
    .toBeVisible();
});

test("says when the library's series can't be listed", async () => {
  mockIPC(
    () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
      throw {
        code: "internal",
        message: "something went wrong inside the app",
      };
    },
    { shouldMockEvents: true },
  );

  const screen = await render(Page);

  await expect
    .element(screen.getByText("Couldn't load your library. Try again later."))
    .toBeVisible();
  expect(
    screen.getByRole("region", { name: "Your library is empty" }).elements(),
  ).toHaveLength(0);
});

test("shows the covers of the library's series once it has some", async () => {
  mockConvertFileSrc("linux");
  listing(() => [SAMPLE_SERIES]);

  const screen = await render(Page);

  const series = screen.getByRole("list", { name: "Series" });
  await expect
    .element(series.getByRole("presentation"))
    .toHaveAttribute("src", `omni://localhost/${COVER}`);
  expect(
    screen.getByRole("region", { name: "Your library is empty" }).elements(),
  ).toHaveLength(0);
});

test("shows the series the library gains once it says it changed", async () => {
  mockConvertFileSrc("linux");
  let catalog: readonly WireSeries[] = [];
  listing(() => catalog);
  const screen = await render(Page);
  await expect
    .element(screen.getByRole("region", { name: "Your library is empty" }))
    .toBeVisible();
  catalog = [SAMPLE_SERIES];

  await emit(LIBRARY_CHANGED);

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
  const screen = await render(Page);
  await expect
    .element(screen.getByRole("region", { name: "Your library is empty" }))
    .toBeVisible();
  await expect.poll(() => counted.asked).toBe(1);
  await screen.unmount();

  await emit(LIBRARY_CHANGED);

  expect(counted.asked).toBe(1);
});
