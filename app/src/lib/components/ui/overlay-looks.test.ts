import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../tests/components/resolved-colour";

import PlatformSurfacesHarness from "./PlatformSurfacesHarness.svelte";
import PopoverHarness from "./popover/PopoverHarness.svelte";

interface MenuLook {
  readonly platform: Platform;
  readonly menuPadding: string;
  readonly itemHeight: number;
  readonly itemCorner: string;
  readonly itemInline: string;
}

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const PHONE_SCREEN = { width: 390, height: 844 } as const;

const MENUS: readonly MenuLook[] = [
  {
    platform: "linux",
    menuPadding: "4px",
    itemHeight: 32,
    itemCorner: "6px",
    itemInline: "8px",
  },
  {
    platform: "macos",
    menuPadding: "5px",
    itemHeight: 24,
    itemCorner: "5px",
    itemInline: "10px",
  },
  {
    platform: "windows",
    menuPadding: "4px",
    itemHeight: 32,
    itemCorner: "4px",
    itemInline: "12px",
  },
];

function usePlatform(platform: Platform): void {
  document.documentElement.dataset.platform = platform;
  document.documentElement.dataset.theme = "light";
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of MENUS) {
  test(`spaces the ${look.platform} menu and its items as the platform does`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    usePlatform(look.platform);
    await render(PlatformSurfacesHarness);
    await page.getByRole("button", { name: "More" }).click();
    const menu = page.getByRole("menu");
    await expect.element(menu).toBeVisible();

    const item = page.getByRole("menuitem", { name: "Mark read" }).element();
    const itemStyle = getComputedStyle(item);

    expect(getComputedStyle(menu.element()).padding).toBe(look.menuPadding);
    expect(item.getBoundingClientRect().height).toBeCloseTo(look.itemHeight, 0);
    expect(itemStyle.borderTopLeftRadius).toBe(look.itemCorner);
    expect(itemStyle.paddingInlineStart).toBe(look.itemInline);
  });
}

test("sets a desktop menu's items at 14px in regular weight", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  usePlatform("linux");
  await render(PlatformSurfacesHarness);
  await page.getByRole("button", { name: "More" }).click();

  const item = page.getByRole("menuitem", { name: "Mark read" }).element();

  expect(getComputedStyle(item).fontSize).toBe("14px");
  expect(getComputedStyle(item).fontWeight).toBe("400");
});

test("lays an Android popover on the high container with 12px corners", async () => {
  await page.viewport(PHONE_SCREEN.width, PHONE_SCREEN.height);
  usePlatform("android");
  await render(PopoverHarness);
  const popover = page.getByRole("dialog", { name: "Light" });
  await expect.element(popover).toBeVisible();

  const style = getComputedStyle(popover.element());

  expect(style.backgroundColor).toBe(
    resolvedColour("--android-container-high", "backgroundColor"),
  );
  expect(style.borderTopLeftRadius).toBe("12px");
});
