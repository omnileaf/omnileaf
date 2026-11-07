import { Tags } from "@lucide/svelte";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SettingsEntries from "./SettingsEntries.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const PROPS = {
  entries: [
    {
      route: "/(app)/settings/library/tags",
      icon: Tags,
      iconName: "tags",
      label: "Manage tags",
      summary: "14 tags",
    },
    {
      route: "/(app)/settings/library/adult-content",
      icon: Tags,
      iconName: "eye-off",
      label: "18+ content",
    },
  ],
} as const;

test("sets each Android entry flush with a bare 24px icon at x=16 and its title at x=56", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsEntries, PROPS);

  const link = screen.getByRole("link", { name: /^Manage tags/ }).element();
  const row = link.getBoundingClientRect();
  const icon = link.querySelector("[data-icon]")?.getBoundingClientRect();
  const title = link.querySelector("[data-slot=item-title]");

  expect(icon?.left).toBeCloseTo(row.left + 16, 0);
  expect(icon?.width).toBeCloseTo(24, 0);
  expect(icon?.height).toBeCloseTo(24, 0);
  expect(title?.getBoundingClientRect().left).toBeCloseTo(row.left + 56, 0);
  expect(row.height).toBeCloseTo(72, 0);
  expect(link.querySelector("[data-slot=item-media]")).toBeNull();
  expect(link.querySelector("svg")).toBeNull();
});

test("draws the Android entries without a border, a divider or a tile", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsEntries, PROPS);

  const list = screen.getByRole("list").element();
  const link = screen.getByRole("link", { name: /^Manage tags/ }).element();
  const title = link.querySelector("[data-slot=item-title]");

  expect(getComputedStyle(list).borderTopWidth).toBe("0px");
  expect(getComputedStyle(link).borderBottomWidth).toBe("0px");
  expect(title ? getComputedStyle(title).letterSpacing : "").toBe("0.5px");
  expect(title ? getComputedStyle(title).fontSize : "").toBe("16px");
});

test("keeps the entries in a bordered list with a Lucide tile off Android", async () => {
  const screen = await render(SettingsEntries, PROPS);

  const list = screen.getByRole("list").element();

  expect(getComputedStyle(list).borderTopWidth).toBe("1px");
  expect(list.querySelectorAll("svg").length).toBeGreaterThan(0);
  expect(list.querySelector("[data-icon]")).toBeNull();
});
