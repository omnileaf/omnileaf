import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

const COVER = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1";

afterEach(() => {
  clearMocks();
});

function listing(series: readonly unknown[]): void {
  mockIPC((command) => {
    if (command !== "library_series") {
      throw new Error(`the page called \`${command}\``);
    }
    return { series, next: null };
  });
}

test("shows that the library is empty", async () => {
  listing([]);

  const screen = await render(Page);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Library" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Your library is empty."))
    .toBeVisible();
});

test("says when the library's series can't be listed", async () => {
  mockIPC(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
    throw { code: "internal", message: "something went wrong inside the app" };
  });

  const screen = await render(Page);

  await expect
    .element(screen.getByText("Couldn't load your library. Try again later."))
    .toBeVisible();
  expect(screen.getByText("Your library is empty.").elements()).toHaveLength(0);
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

  const screen = await render(Page);

  const series = screen.getByRole("list", { name: "Series" });
  await expect
    .element(series.getByRole("presentation"))
    .toHaveAttribute("src", `omni://localhost/${COVER}`);
  expect(screen.getByText("Your library is empty.").elements()).toHaveLength(0);
});
