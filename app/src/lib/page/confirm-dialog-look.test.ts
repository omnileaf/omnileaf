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
