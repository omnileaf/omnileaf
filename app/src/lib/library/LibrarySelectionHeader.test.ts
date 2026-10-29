import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import LibrarySelectionHeader from "./LibrarySelectionHeader.svelte";

const PHONE = { width: 402, height: 874 };
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

  await selectAll.click();
  await done.click();
  expect({
    selectAll: onSelectAll.mock.calls.length,
    done: onCancel.mock.calls.length,
  }).toEqual({ selectAll: 1, done: 1 });
});

test("centres the count between the buttons on an iPhone", () => {
  renderHeader("ios");

  expect(
    getComputedStyle(page.getByText("3 selected").element()).textAlign,
  ).toBe("center");
});

test("keeps the cancel button and no Done on an Android phone", async () => {
  renderHeader("android");

  await expect
    .element(page.getByRole("button", { name: "Cancel selecting" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .not.toBeInTheDocument();
});

test("keeps the cancel button and no Done on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  renderHeader("ios");

  await expect
    .element(page.getByRole("button", { name: "Cancel selecting" }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Done" }))
    .not.toBeInTheDocument();
});
