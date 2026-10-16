import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../tests/components/resolved-colour";

import DrawerHarness from "./drawer/DrawerHarness.svelte";
import PlatformSurfacesHarness from "./PlatformSurfacesHarness.svelte";
import PopoverHarness from "./popover/PopoverHarness.svelte";

interface MenuLook {
  readonly platform: Platform;
  readonly menuPadding: string;
  readonly itemHeight: number;
  readonly itemCorner: string;
  readonly itemInline: string;
}

interface SheetLook {
  readonly platform: Platform;
  readonly corner: string;
  readonly fill: string;
  readonly handle: readonly [number, number];
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

const SHEETS: readonly SheetLook[] = [
  {
    platform: "android",
    corner: "28px",
    fill: "--android-container-low",
    handle: [32, 4],
  },
  {
    platform: "ios",
    corner: "14px",
    fill: "--card",
    handle: [36, 5],
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

test("lists an Android menu's items edge to edge, 48px tall and square", async () => {
  await page.viewport(PHONE_SCREEN.width, PHONE_SCREEN.height);
  usePlatform("android");
  await render(PlatformSurfacesHarness);
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu");
  await expect.element(menu).toBeVisible();

  const item = page.getByRole("menuitem", { name: "Mark read" }).element();

  expect(getComputedStyle(menu.element()).padding).toBe("8px 0px");
  expect(item.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(getComputedStyle(item).borderTopLeftRadius).toBe("0px");
});

test("lays an Android popover on the high container with 12px corners", async () => {
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

for (const look of SHEETS) {
  test(`draws the ${look.platform} bottom sheet with its own corners, ground and handle`, async () => {
    await page.viewport(PHONE_SCREEN.width, PHONE_SCREEN.height);
    usePlatform(look.platform);
    await render(DrawerHarness);
    const sheet = page.getByRole("dialog", { name: "Volume 3" });
    await expect.element(sheet).toBeVisible();

    const style = getComputedStyle(sheet.element());
    const handle = sheet
      .element()
      .querySelector(":scope > span[aria-hidden]")
      ?.getBoundingClientRect();

    expect(style.borderTopLeftRadius).toBe(look.corner);
    expect(style.backgroundColor).toBe(
      resolvedColour(look.fill, "backgroundColor"),
    );
    expect([handle?.width, handle?.height]).toEqual(look.handle);
  });
}
