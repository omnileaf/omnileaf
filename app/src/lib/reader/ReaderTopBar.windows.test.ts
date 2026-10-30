import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import ReaderTopBarHarness from "./ReaderTopBarHarness.svelte";

const DESKTOP = { width: 1280, height: 800 };
const COMMAND_LABELS = ["Shortcuts", "Bookmark", "Settings", "Full screen"];

async function openReader(
  platform: Platform,
  theme: "light" | "dark" = "light",
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await page.viewport(DESKTOP.width, DESKTOP.height);
  await render(ReaderTopBarHarness, { platform });
}

function boxOf(name: string): DOMRect {
  return page
    .getByRole("button", { name, exact: true })
    .element()
    .getBoundingClientRect();
}

function bar(): HTMLElement {
  const element = page.getByRole("main").element().firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("the reader drew no bar");
  }
  return element;
}

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws the reader's primary actions as 68 wide command bar buttons 64 tall", async () => {
  await openReader("windows");

  for (const [name, label] of [
    ["Keyboard shortcuts", "Shortcuts"],
    ["Bookmark this page", "Bookmark"],
    ["Reading settings", "Settings"],
    ["Full screen", "Full screen"],
  ]) {
    const box = boxOf(name ?? "");

    expect({ label, width: box.width, height: box.height }).toEqual({
      label,
      width: 68,
      height: 64,
    });
  }
});

test("shows each command's label under its 20 wide icon", async () => {
  await openReader("windows");

  for (const label of COMMAND_LABELS) {
    const text = page.getByText(label, { exact: true }).element();
    const button = text.closest("button");
    const icon = button?.querySelector("svg")?.getBoundingClientRect();

    expect(icon?.width, label).toBe(20);
    expect(icon?.bottom ?? Infinity, label).toBeLessThanOrEqual(
      text.getBoundingClientRect().top,
    );
  }
});

test("keeps More an icon on its own, 48 wide", async () => {
  await openReader("windows");

  expect(boxOf("More").width).toBe(48);
  expect(page.getByText("More", { exact: true }).query()).toBeNull();
});

test("sits the bar on the flyout acrylic over the page with a blur behind it", async () => {
  await openReader("windows");
  const style = getComputedStyle(bar());

  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-menu", "backgroundColor"),
  );
  expect(style.backdropFilter).toBe("blur(30px)");
  expect(style.borderBottomColor).toBe(
    resolvedColour("--native-color-menu-edge", "color"),
  );
});

test("draws the command bar's ink in the dark chrome too", async () => {
  await openReader("windows", "dark");

  expect(getComputedStyle(bar()).backgroundColor).toBe(
    "rgba(44, 44, 44, 0.96)",
  );
});

for (const platform of ["linux", "macos", "ios", "android"] as const) {
  test(`draws no command labels on ${platform}`, async () => {
    await openReader(platform);

    for (const label of COMMAND_LABELS) {
      expect(page.getByText(label, { exact: true }).query(), label).toBeNull();
    }
  });
}
