import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import PlatformSurfacesHarness from "./PlatformSurfacesHarness.svelte";

interface PlatformLook {
  readonly platform: Platform;
  readonly menu: string;
  readonly menuCorner: string;
  readonly tooltip: string;
  readonly switchOn: string;
  readonly secondaryText: string;
  readonly font: RegExp;
}

const LOOKS: readonly PlatformLook[] = [
  {
    platform: "linux",
    menu: "--popover",
    menuCorner: "8px",
    tooltip: "--primary",
    switchOn: "--primary",
    secondaryText: "--muted-foreground",
    font: /^ui-sans-serif/,
  },
  {
    platform: "android",
    menu: "--popover",
    menuCorner: "8px",
    tooltip: "--primary",
    switchOn: "--primary",
    secondaryText: "--muted-foreground",
    font: /^ui-sans-serif/,
  },
  {
    platform: "ios",
    menu: "--ios-material",
    menuCorner: "14px",
    tooltip: "--primary",
    switchOn: "--ios-switch-on",
    secondaryText: "--ios-secondary-label",
    font: /^-apple-system/,
  },
  {
    platform: "macos",
    menu: "--macos-menu-material",
    menuCorner: "10px",
    tooltip: "--macos-menu-material",
    switchOn: "--macos-switch-on",
    secondaryText: "--macos-secondary-label",
    font: /^-apple-system/,
  },
  {
    platform: "windows",
    menu: "--windows-flyout",
    menuCorner: "8px",
    tooltip: "--windows-flyout",
    switchOn: "--primary",
    secondaryText: "--windows-secondary-text",
    font: /^"Segoe UI Variable Text"/,
  },
];

function colourOf(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws menus, tooltips, switches and secondary text in the ${look.platform} layer`, async () => {
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(PlatformSurfacesHarness);
    await userEvent.hover(
      page.getByRole("button", { name: "Rescan Sample Comics" }),
    );
    const tooltip = page.getByText("Rescan", { exact: true });
    await expect.element(tooltip).toBeVisible();
    const tooltipFill = getComputedStyle(tooltip.element()).backgroundColor;
    await page.getByRole("button", { name: "More" }).click();
    const menu = page.getByRole("menu");
    await expect.element(menu).toBeVisible();

    const menuStyle = getComputedStyle(menu.element());
    const track = page
      .getByRole("switch", { name: "Check folders" })
      .element()
      .querySelector("span");

    expect(menuStyle.backgroundColor).toBe(colourOf(look.menu));
    expect(menuStyle.borderTopLeftRadius).toBe(look.menuCorner);
    expect(tooltipFill).toBe(colourOf(look.tooltip));
    expect(track && getComputedStyle(track).backgroundColor).toBe(
      colourOf(look.switchOn),
    );
    expect(
      getComputedStyle(page.getByText("Added Sep 21, 2026").element()).color,
    ).toBe(colourOf(look.secondaryText));
    expect(getComputedStyle(document.body).fontFamily).toMatch(look.font);
  });
}
