import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import LibrarySelectionHeader from "./LibrarySelectionHeader.svelte";

const PHONE = { width: 402, height: 874 };
const CLEAR_LAYER = "rgba(0, 0, 0, 0) 0px 0px 0px 0px";
const TABLET = { width: 820, height: 1180 };

function renderHeader(platform: Platform) {
  const onSelectAll = vi.fn();
  const onCancel = vi.fn();
  followCorePlatform(platform);
  const view = render(LibrarySelectionHeader, {
    platform,
    count: 3,
    onSelectAll,
    onCancel,
  });
  return { view, onSelectAll, onCancel };
}

beforeEach(async () => {
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("puts Select all on the left and Done on the right of the count on an iPhone", async () => {
  const { onSelectAll, onCancel } = renderHeader("ios");

  const selectAll = page.getByRole("button", { name: "Select all" });
  const done = page.getByRole("button", { name: "Done" });
  const count = page.getByText("3 selected");
  const left = selectAll.element().getBoundingClientRect();
  const middle = count.element().getBoundingClientRect();
  const right = done.element().getBoundingClientRect();

  expect(left.right).toBeLessThanOrEqual(middle.left);
  expect(middle.right).toBeLessThanOrEqual(right.left);
  await expect
    .element(page.getByRole("button", { name: "Cancel selecting" }))
    .not.toBeInTheDocument();

  expect(getComputedStyle(done.element()).backgroundColor).not.toBe(
    getComputedStyle(selectAll.element()).backgroundColor,
  );
  expect(right.height).toBe(left.height);

  await selectAll.click();
  await done.click();
  expect({
    selectAll: onSelectAll.mock.calls.length,
    done: onCancel.mock.calls.length,
  }).toEqual({ selectAll: 1, done: 1 });
});

test("draws Select all as a glass bar button at weight 510 on an iPhone", () => {
  renderHeader("ios");
  const button = page.getByRole("button", { name: "Select all" }).element();
  const style = getComputedStyle(button);

  expect({
    isCapsule:
      Number.parseFloat(style.borderTopLeftRadius) >=
      button.getBoundingClientRect().height / 2,
    weight: style.fontWeight,
    fill: style.backgroundColor,
  }).toEqual({
    isCapsule: true,
    weight: "510",
    fill: resolvedColour("--color-native-bar-button", "backgroundColor"),
  });
});

test("draws Done as a bar-sized capsule on the primary fill, without the glass shadow, on an iPhone", () => {
  renderHeader("ios");
  const style = getComputedStyle(
    page.getByRole("button", { name: "Done" }).element(),
  );

  expect({
    fill: style.backgroundColor,
    ink: style.color,
    weight: style.fontWeight,
    hasShadow:
      style.boxShadow.replaceAll(CLEAR_LAYER, "").replaceAll(",", "").trim() !==
      "",
  }).toEqual({
    fill: resolvedColour("--color-native-button-primary", "backgroundColor"),
    ink: resolvedColour("--color-native-on-button-primary", "color"),
    weight: "510",
    hasShadow: false,
  });
});

test("centres the count between the buttons on an iPhone", () => {
  renderHeader("ios");

  expect(
    getComputedStyle(page.getByText("3 selected").element()).textAlign,
  ).toBe("center");
});

test("keeps the cancel button and no Done on an Android phone", async () => {
  renderHeader("android");

  expect(
    getComputedStyle(page.getByRole("button", { name: "Select all" }).element())
      .backgroundColor,
  ).toBe("rgba(0, 0, 0, 0)");
  await expect
    .element(page.getByRole("button", { name: "Cancel selecting" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .not.toBeInTheDocument();
});

test("puts Select all and Done on one row with the count under them on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  const { onSelectAll, onCancel } = renderHeader("ios");

  const selectAll = page.getByRole("button", { name: "Select all" });
  const done = page.getByRole("button", { name: "Done" });
  const left = selectAll.element().getBoundingClientRect();
  const right = done.element().getBoundingClientRect();
  const count = page.getByText("3 selected").element().getBoundingClientRect();

  expect(right.left).toBeGreaterThan(left.right);
  expect(right.top).toBe(left.top);
  expect(count.top).toBeGreaterThanOrEqual(left.bottom);
  expect(count.left).toBe(left.left);
  await expect
    .element(page.getByRole("button", { name: "Cancel selecting" }))
    .not.toBeInTheDocument();

  await selectAll.click();
  await done.click();
  expect({
    selectAll: onSelectAll.mock.calls.length,
    done: onCancel.mock.calls.length,
  }).toEqual({ selectAll: 1, done: 1 });
});

test("sets the count at title large on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  renderHeader("ios");
  const style = getComputedStyle(page.getByText("3 selected").element());

  expect({
    size: style.fontSize,
    line: style.lineHeight,
    weight: style.fontWeight,
    align: style.textAlign,
  }).toEqual({ size: "34px", line: "41px", weight: "700", align: "start" });
});

test("draws Select all as a glass bar button and Done on the primary fill on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  renderHeader("ios");
  const selectAll = getComputedStyle(
    page.getByRole("button", { name: "Select all" }).element(),
  );
  const done = getComputedStyle(
    page.getByRole("button", { name: "Done" }).element(),
  );

  expect({
    selectAllFill: selectAll.backgroundColor,
    doneFill: done.backgroundColor,
    doneInk: done.color,
  }).toEqual({
    selectAllFill: resolvedColour(
      "--color-native-bar-button",
      "backgroundColor",
    ),
    doneFill: resolvedColour(
      "--color-native-button-primary",
      "backgroundColor",
    ),
    doneInk: resolvedColour("--color-native-on-button-primary", "color"),
  });
});

test("keeps the cancel button and no Done on an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  renderHeader("android");

  await expect
    .element(page.getByRole("button", { name: "Cancel selecting" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .not.toBeInTheDocument();
});
