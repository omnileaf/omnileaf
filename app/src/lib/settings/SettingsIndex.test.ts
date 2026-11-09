import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";
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

test("sets each Android row flush with a bare 24px icon at x=16 and its title at x=56, with no divider", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const link = screen.getByRole("link", { name: /^Appearance/ }).element();
  const icon = link.querySelector("[data-icon]");
  const title = link.querySelector("[data-slot=item-title]");
  const list = link.closest("ul");
  const row = link.getBoundingClientRect();

  expect(link.querySelector("[data-slot=item-media]")).toBeNull();
  expect(icon?.getBoundingClientRect().left).toBeCloseTo(row.left + 16, 0);
  expect(icon?.getBoundingClientRect().width).toBeCloseTo(24, 0);
  expect(title?.getBoundingClientRect().left).toBeCloseTo(row.left + 56, 0);
  expect(row.height).toBeCloseTo(72, 0);
  expect(list ? getComputedStyle(list).borderTopWidth : "").toBe("0px");
  expect(getComputedStyle(link).borderBottomWidth).toBe("0px");
  const chevron = link.querySelector("svg");
  expect(chevron ? getComputedStyle(chevron).display : "none").toBe("none");
});

test("sets each Android title in 16px regular with 0.5px tracking over a 14px line", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const link = screen.getByRole("link", { name: /^Appearance/ }).element();
  const title = link.querySelector("[data-slot=item-title]");
  const line = link.querySelector("[data-slot=item-description]");

  expect(title ? getComputedStyle(title).letterSpacing : "").toBe("0.5px");
  expect(title ? getComputedStyle(title).fontSize : "").toBe("16px");
  expect(line ? getComputedStyle(line).fontSize : "").toBe("14px");
});

test("sets each Android group heading 44px tall with 16px above and 8px below", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const heading = screen.getByRole("heading", { name: "App" }).element();
  const style = getComputedStyle(heading);

  expect(heading.getBoundingClientRect().height).toBeCloseTo(44, 0);
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingBottom).toBe("8px");
});

test("sets each Android group heading in one 14px medium accent type", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const heading = screen.getByRole("heading", { name: "App" }).element();
  const style = getComputedStyle(heading);

  expect([style.fontSize, style.lineHeight, style.fontWeight]).toEqual([
    "14px",
    "20px",
    "500",
  ]);
  expect(style.color).toBe(resolvedColour("--color-accent", "color"));
  expect(heading.classList.contains("text-small")).toBe(false);
  expect(heading.classList.contains("font-semibold")).toBe(false);
});

test("heads About on Android only", async () => {
  followCorePlatform("android");
  const android = await render(SettingsIndex, PROPS);

  await expect
    .element(android.getByRole("heading", { name: "About" }))
    .toBeVisible();
});

test("leaves About without a heading off Android", async () => {
  const screen = await render(SettingsIndex, PROPS);

  expect(screen.getByRole("heading", { name: "About" }).elements()).toEqual([]);
});

test("keeps the desktop rows in their bordered list", async () => {
  const screen = await render(SettingsIndex, PROPS);

  const list = screen.getByRole("list", { name: "App" }).element();

  expect(getComputedStyle(list).borderTopWidth).toBe("1px");
  expect(
    screen.container.querySelectorAll("[data-slot=item-media]").length,
  ).toBe(8);
});

test("lists Trackers last in Reading on Android as a disabled row that says it is coming soon", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const row = screen.getByRole("button", { name: /^Trackers/ });
  const reading = screen.getByRole("list", { name: "Reading" }).element();

  await expect.element(row).toHaveAttribute("aria-disabled", "true");
  expect(row.element().textContent).toContain("Coming soon");
  expect(reading.lastElementChild?.contains(row.element())).toBe(true);
});

test("sets the Android Trackers row like the other rows, its icon at x=16 and its title at x=56", async () => {
  followCorePlatform("android");
  const screen = await render(SettingsIndex, PROPS);

  const row = screen.getByRole("button", { name: /^Trackers/ }).element();
  const icon = row.querySelector("[data-icon]");
  const title = row.querySelector("[data-slot=item-title]");
  const box = row.getBoundingClientRect();

  expect(icon?.getBoundingClientRect().left).toBeCloseTo(box.left + 16, 0);
  expect(title?.getBoundingClientRect().left).toBeCloseTo(box.left + 56, 0);
  expect(box.height).toBeCloseTo(72, 0);
});

test("leaves Trackers out of the list everywhere but Android", async () => {
  const screen = await render(SettingsIndex, PROPS);

  expect(screen.getByRole("button", { name: /^Trackers/ }).elements()).toEqual(
    [],
  );
});
