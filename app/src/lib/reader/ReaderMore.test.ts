import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { showFileLabel } from "#lib/page/show-file.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import ReaderTopBarHarness from "./ReaderTopBarHarness.svelte";

const PHONE = { width: 400, height: 800 };
const DESKTOP = { width: 1280, height: 800 };

async function openMore(
  platform: Platform,
  size: { width: number; height: number },
  onShowFile: (() => void) | undefined,
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(size.width, size.height);
  await render(ReaderTopBarHarness, { platform, onShowFile });
  await page.getByRole("button", { name: "More", exact: true }).click();
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

const LAYOUTS = [
  ["windows", DESKTOP, "menuitem"],
  ["macos", DESKTOP, "menuitem"],
  ["linux", DESKTOP, "menuitem"],
  ["ios", PHONE, "menuitem"],
  ["android", PHONE, "button"],
] as const;

test.each(LAYOUTS)(
  "shows the book's file from %s's More",
  async (platform, size, role) => {
    const onShowFile = vi.fn();
    await openMore(platform, size, onShowFile);

    await page.getByRole(role, { name: showFileLabel(platform) }).click();

    expect(onShowFile).toHaveBeenCalledOnce();
  },
);

test("closes the Android phone More sheet once the file is shown", async () => {
  await openMore("android", PHONE, vi.fn());

  await page.getByRole("button", { name: "Show the file" }).click();

  await expect
    .element(page.getByRole("button", { name: "Show the file" }))
    .not.toBeInTheDocument();
});

test.each(LAYOUTS)(
  "leaves Show the file out of %s's More when the book is not in the library",
  async (platform, size) => {
    await openMore(platform, size, undefined);

    expect(page.getByText("Mark read").elements()).not.toHaveLength(0);
    expect(page.getByText(showFileLabel(platform)).elements()).toHaveLength(0);
  },
);

const ROWS = ["Mark read", "Start over", "Show the file"] as const;
const CLEAR = "rgba(0, 0, 0, 0)";

function backRow(): HTMLElement {
  const element = page
    .getByRole("link", { name: "Back to the library" })
    .element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("More drew no way back");
  }
  return element;
}

function actionRow(name: string): HTMLElement {
  const element = page.getByRole("button", { name }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`More drew no ${name} row`);
  }
  return element;
}

test("sets every Android phone More row in the board's 56px row with a 4px corner", async () => {
  await openMore("android", PHONE, vi.fn());

  const rows = [...ROWS.map(actionRow), backRow()].map((row) => {
    const style = getComputedStyle(row);
    return [
      style.paddingLeft,
      style.paddingRight,
      style.columnGap,
      style.minHeight,
      style.borderTopLeftRadius,
    ];
  });

  expect(rows).toEqual(
    Array(rows.length).fill(["16px", "24px", "16px", "56px", "4px"]),
  );
});

function focusedRow(): HTMLElement {
  const row = [...ROWS.map(actionRow), backRow()].find(
    (candidate) => candidate === document.activeElement,
  );
  if (row === undefined) {
    throw new Error("no More row has the keyboard focus");
  }
  return row;
}

test("leaves every Android phone More row clear at rest", async () => {
  await openMore("android", PHONE, vi.fn());

  const backgrounds = [...ROWS.map(actionRow), backRow()].map(
    (row) => getComputedStyle(row).backgroundColor,
  );

  expect(backgrounds).toEqual(Array(backgrounds.length).fill(CLEAR));
});

test("tints the keyboard-focused Android phone More row in the tonal row colour", async () => {
  await openMore("android", PHONE, vi.fn());

  await userEvent.tab();

  const row = focusedRow();
  await expect
    .poll(() => getComputedStyle(row).backgroundColor)
    .toBe(resolvedColour("--native-color-row-pressed", "backgroundColor"));
});
