import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SettingsIndex from "./SettingsIndex.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

const PROPS = {
  summaries: {
    "/(app)/settings/appearance": { text: "Follows the system" },
    "/(app)/settings/about": { text: "Version 1.2.3" },
  },
};

test("groups the pages under App, Reading and Data and privacy, as the Settings list draws them", async () => {
  const screen = await render(SettingsIndex, PROPS);

  const named = (group: string) =>
    screen
      .getByRole("list", { name: group })
      .getByRole("link")
      .elements()
      .map((link) =>
        link.querySelector("[data-slot=item-title]")?.textContent.trim(),
      );

  expect([named("App"), named("Reading"), named("Data and privacy")]).toEqual([
    ["General", "Appearance"],
    ["Library", "Reader"],
    ["Privacy and security", "Storage", "Advanced"],
  ]);
});

test("shows a section's summary under its name", async () => {
  const screen = await render(SettingsIndex, PROPS);

  await expect
    .element(
      screen
        .getByRole("link", { name: /^Appearance/ })
        .getByText("Follows the system"),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("link", { name: /^About/ }).getByText("Version 1.2.3"),
    )
    .toBeVisible();
});

test("names a section without a summary by its title alone", async () => {
  const screen = await render(SettingsIndex, PROPS);

  await expect
    .element(screen.getByRole("link", { name: "Library", exact: true }))
    .toBeVisible();
});

test("lists About on its own, last", async () => {
  const screen = await render(SettingsIndex, PROPS);

  const lists = screen.getByRole("list").elements();
  const last = lists.at(-1);

  expect(last?.querySelectorAll("a")).toHaveLength(1);
  expect(last?.textContent).toContain("About");
});

test("renders native Icon components for sections on Android", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const icons = screen.container.querySelectorAll("[data-icon]");
  expect(icons.length).toBeGreaterThanOrEqual(8);
  expect(
    screen.container.querySelector('[data-icon="settings"]'),
  ).not.toBeNull();
  expect(
    screen.container.querySelector('[data-icon="library"]'),
  ).not.toBeNull();
});

test("renders 40px tonal circles with 24px Material Symbols and row subtitles on Android", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const media = screen.container.querySelector("[data-slot=item-media]");
  expect(media).not.toBeNull();
  expect(media?.getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(media?.getBoundingClientRect().width).toBeCloseTo(40, 0);

  const icon = media?.querySelector("[data-icon]");
  expect(icon).not.toBeNull();
  expect(icon?.className).toContain("inline-native-icon");

  const desc = screen.container.querySelector("[data-slot=item-description]");
  expect(desc?.className).toContain(
    "android:text-native-row-subtitle/native-row-subtitle",
  );
});
