import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import LibraryMore from "./LibraryMore.svelte";

let main: HTMLElement;

beforeEach(() => {
  main = document.createElement("main");
  document.body.appendChild(main);
});

afterEach(() => {
  main.remove();
});

test("renders native Icon on Android trigger", async () => {
  followCorePlatform("android");
  const screen = await render(LibraryMore, {
    keepsLabels: true,
    onSelect: () => {},
  });

  const icon = screen.container.querySelector('[data-icon="ellipsis"]');
  expect(icon).not.toBeNull();
});

const PHONE = { width: 390, height: 844 };
const ANDROID_MENU_ICON_SIZE = 20;
const ANDROID_OPEN_RADIUS = "8px";

async function openMenuOn(platform: "android" | "ios"): Promise<void> {
  followCorePlatform(platform);
  await page.viewport(PHONE.width, PHONE.height);
  await render(LibraryMore, { keepsLabels: true, onSelect: () => undefined });
  await page.getByRole("button", { name: "More for the library" }).click();
}

test("draws the menu's items with 20px Material icons on an Android phone", async () => {
  await openMenuOn("android");

  const icons = page
    .getByRole("menuitem")
    .elements()
    .map((item) => item.querySelector("[data-icon]"));

  expect(icons).toHaveLength(4);
  for (const icon of icons) {
    expect(icon?.getBoundingClientRect().width).toBe(ANDROID_MENU_ICON_SIZE);
  }
});

test("rounds the open More button to 8px on an Android phone", async () => {
  await openMenuOn("android");

  const trigger = page
    .getByRole("button", { name: "More for the library" })
    .element();

  expect(getComputedStyle(trigger).borderTopLeftRadius).toBe(
    ANDROID_OPEN_RADIUS,
  );
});

test("keeps 16px Lucide icons in the menu on an iPhone", async () => {
  await openMenuOn("ios");

  const icon = page
    .getByRole("menuitem")
    .first()
    .element()
    .querySelector("svg");

  expect(icon?.getBoundingClientRect().width).toBe(16);
});
