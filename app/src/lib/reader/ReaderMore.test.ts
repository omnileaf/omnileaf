import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { showFileLabel } from "#lib/page/show-file.ts";

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

const LAYOUTS = [
  ["windows", DESKTOP, "menuitem"],
  ["macos", DESKTOP, "menuitem"],
  ["linux", DESKTOP, "menuitem"],
  ["ios", PHONE, "menuitem"],
  ["android", PHONE, "button"],
] as const;

test.each(LAYOUTS)(
  "shows the book's file from %s's More",
  async (platform, size, role) => {
    const onShowFile = vi.fn();
    await openMore(platform, size, onShowFile);

    await page.getByRole(role, { name: showFileLabel(platform) }).click();

    expect(onShowFile).toHaveBeenCalledOnce();
  },
);

test("closes the Android phone More sheet once the file is shown", async () => {
  await openMore("android", PHONE, vi.fn());

  await page.getByRole("button", { name: "Show the file" }).click();

  await expect
    .element(page.getByRole("button", { name: "Show the file" }))
    .not.toBeInTheDocument();
});

test.each(LAYOUTS)(
  "leaves Show the file out of %s's More when the book is not in the library",
  async (platform, size) => {
    await openMore(platform, size, undefined);

    expect(page.getByText("Mark read").elements()).not.toHaveLength(0);
    expect(page.getByText(showFileLabel(platform)).elements()).toHaveLength(0);
  },
);
