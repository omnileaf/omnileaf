import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import LibrarySelectionHeader from "./LibrarySelectionHeader.svelte";
import { selectionActions } from "./selection-actions.ts";

const DESKTOP = { width: 1280, height: 800 };
const COMMAND = { width: 68, height: 64 };

function renderHeader(platform: Platform, count = 2) {
  const onSelectAll = vi.fn();
  const onCancel = vi.fn();
  const onLabels = vi.fn();
  const onMarkRead = vi.fn();
  followCorePlatform(platform);
  const view = render(LibrarySelectionHeader, {
    platform,
    count,
    onSelectAll,
    onCancel,
    actions: selectionActions({ keepsLabels: true, onLabels, onMarkRead }),
  });
  return { view, onSelectAll, onCancel, onLabels, onMarkRead };
}

function command(name: string): HTMLElement {
  const element = page.getByRole("button", { name, exact: false }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the ${name} command drew no element`);
  }
  return element;
}

beforeEach(async () => {
  document.documentElement.dataset.theme = "light";
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("lays the selection's commands out as a labelled command bar of buttons 68 wide at least and 64 tall", () => {
  renderHeader("windows");

  for (const name of ["Select all", "Categories", "Tags", "Mark as read"]) {
    const box = command(name).getBoundingClientRect();
    expect([name, box.width >= COMMAND.width, box.height]).toEqual([
      name,
      true,
      COMMAND.height,
    ]);
  }
  expect(command("Tags").getBoundingClientRect().width).toBe(COMMAND.width);
});

test("keeps the commands to the end of the bar, after the count", () => {
  renderHeader("windows");

  const count = page.getByText("2 selected").element().getBoundingClientRect();
  const first = command("Select all").getBoundingClientRect();
  const last = command("Mark as read").getBoundingClientRect();

  expect(count.right).toBeLessThanOrEqual(first.left);
  expect(first.right).toBeLessThanOrEqual(last.left);
});

test("sets the selected count as the page's 28 over 36 semibold Title", () => {
  renderHeader("windows");

  const style = getComputedStyle(page.getByText("2 selected").element());

  expect([style.fontSize, style.lineHeight, style.fontWeight]).toEqual([
    "28px",
    "36px",
    "600",
  ]);
});

test("runs a command when it is pressed", async () => {
  const { onMarkRead, onLabels } = renderHeader("windows");

  await page.getByRole("button", { name: "Mark as read" }).click();
  await page.getByRole("button", { name: "Tags" }).click();

  expect([onMarkRead.mock.calls.length, onLabels.mock.calls]).toEqual([
    1,
    [["tags"]],
  ]);
});

test("turns the commands that act on picks off while nothing is picked, and keeps Select all on", () => {
  renderHeader("windows", 0);

  expect([
    command("Select all").hasAttribute("disabled"),
    command("Mark as read").hasAttribute("disabled"),
    getComputedStyle(command("Mark as read")).color,
  ]).toEqual([
    false,
    true,
    resolvedColour("--native-color-on-button-disabled", "color"),
  ]);
});

test("puts no command bar on the other desktops", () => {
  renderHeader("linux");

  expect(command("Select all").getBoundingClientRect().width).not.toBe(
    COMMAND.width,
  );
  expect(page.getByRole("button", { name: "Mark as read" }).elements()).toEqual(
    [],
  );
});
