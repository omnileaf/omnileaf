import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import CacheRow from "./CacheRow.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const ANDROID_TABLET_WIDTH = 800;

const PROPS = {
  title: "Cached pages",
  detail: "1.2 GB",
  isClearing: false,
  onClear: () => undefined,
};

test("sets the Android row flush with 0.5px tracking and a 40px Clear button", async () => {
  followCorePlatform("android");
  const screen = await render(CacheRow, PROPS);

  const title = screen.getByText("Cached pages", { exact: true }).element();
  const clear = screen.getByRole("button").element();

  expect(getComputedStyle(title).letterSpacing).toBe("0.5px");
  expect(title.getBoundingClientRect().left).toBeCloseTo(16, 0);
  expect(clear.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(getComputedStyle(clear).borderTopWidth).toBe("0px");
});

test("keeps the regular row and Clear button on Android tablets", async () => {
  await page.viewport(ANDROID_TABLET_WIDTH, 1024);
  followCorePlatform("android");
  const screen = await render(CacheRow, PROPS);

  const title = screen.getByText("Cached pages", { exact: true }).element();
  const clear = screen.getByRole("button").element();

  expect(getComputedStyle(title).fontWeight).toBe("500");
  expect(getComputedStyle(title).letterSpacing).not.toBe("0.5px");
  expect(clear.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});
