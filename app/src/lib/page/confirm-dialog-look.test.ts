import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";
import ConfirmDialogHarness from "./ConfirmDialogHarness.svelte";

interface DialogLook {
  readonly platform: Platform;
  readonly corner: string;
  readonly fill: string;
  readonly edge: string;
  readonly shadow: string;
}

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;

const LOOKS: readonly DialogLook[] = [
  {
    platform: "linux",
    corner: "10px",
    fill: "--background",
    edge: "--border",
    shadow: "--shadow-lg",
  },
  {
    platform: "android",
    corner: "28px",
    fill: "--android-container-high",
    edge: "transparent",
    shadow: "--shadow-lg",
  },
  {
    platform: "ios",
    corner: "10px",
    fill: "--background",
    edge: "--border",
    shadow: "--shadow-lg",
  },
  {
    platform: "macos",
    corner: "10px",
    fill: "--background",
    edge: "--border",
    shadow: "--shadow-macos-menu",
  },
  {
    platform: "windows",
    corner: "8px",
    fill: "--background",
    edge: "--windows-stroke",
    shadow: "--shadow-windows-flyout",
  },
];

function shadowOf(token: string): string {
  const probe = document.createElement("span");
  probe.style.boxShadow = `var(${token})`;
  document.body.append(probe);
  const shadow = getComputedStyle(probe).boxShadow;
  probe.remove();
  return shadow;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`frames the confirm dialog the ${look.platform} way`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(ConfirmDialogHarness);

    const dialog = page.getByRole("alertdialog", { name: "Delete downloads?" });
    await expect.element(dialog).toBeVisible();
    const style = getComputedStyle(dialog.element());

    expect(style.borderTopLeftRadius).toBe(look.corner);
    expect(style.backgroundColor).toBe(
      resolvedColour(look.fill, "backgroundColor"),
    );
    expect(style.borderTopColor).toBe(resolvedColour(look.edge, "color"));
    expect(style.boxShadow).toContain(shadowOf(look.shadow));
  });
}

test("sets the Windows buttons on a band under a stroke", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  await render(ConfirmDialogHarness);

  const footer = page
    .getByRole("button", { name: "Cancel" })
    .element().parentElement;
  if (footer === null) {
    throw new Error("the Cancel button has no footer around it");
  }
  const style = getComputedStyle(footer);

  expect(style.backgroundColor).toBe(
    resolvedColour("--windows-mica", "backgroundColor"),
  );
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(
    resolvedColour("--windows-stroke", "color"),
  );
});

test("leaves room for the focus ring around the buttons", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "linux";
  await render(ConfirmDialogHarness);

  const cancel = page.getByRole("button", { name: "Cancel" }).element();
  const scroller = cancel.closest(".overflow-auto");
  if (scroller === null) {
    throw new Error("the buttons sit in no scrolling area");
  }
  const button = cancel.getBoundingClientRect();
  const area = scroller.getBoundingClientRect();
  const ringReach = 4;

  expect(button.left - area.left).toBeGreaterThanOrEqual(ringReach);
  expect(area.bottom - button.bottom).toBeGreaterThanOrEqual(ringReach);
});
