import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ReaderTopBarHarness from "./ReaderTopBarHarness.svelte";

const PHONE = { width: 400, height: 800 };
const DESKTOP = { width: 1280, height: 800 };

async function openMore(
  platform: Platform,
  size: { width: number; height: number },
  onShowFile: (() => void) | undefined,
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(size.width, size.height);
  await render(ReaderTopBarHarness, { platform, onShowFile });
  await page.getByRole("button", { name: "More", exact: true }).click();
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("shows the book's file from the desktop More menu", async () => {
  const onShowFile = vi.fn();
  await openMore("windows", DESKTOP, onShowFile);

  await page.getByRole("menuitem", { name: "Show in File Explorer" }).click();

  expect(onShowFile).toHaveBeenCalledOnce();
});

test("shows the book's file from the Android phone More sheet and closes it", async () => {
  const onShowFile = vi.fn();
  await openMore("android", PHONE, onShowFile);

  await page.getByRole("button", { name: "Show the file" }).click();

  expect(onShowFile).toHaveBeenCalledOnce();
  await expect
    .element(page.getByRole("button", { name: "Show the file" }))
    .not.toBeInTheDocument();
});

test.each([
  ["windows", DESKTOP],
  ["android", PHONE],
] as const)(
  "leaves Show the file out of %s's More when the book is not in the library",
  async (platform, size) => {
    await openMore(platform, size, undefined);

    expect(page.getByText("Mark read").elements()).not.toHaveLength(0);
    expect(
      page.getByText(/Show (the file|in File Explorer)/).elements(),
    ).toHaveLength(0);
  },
);
