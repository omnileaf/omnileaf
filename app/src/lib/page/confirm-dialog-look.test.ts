import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
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
const PHONE = { width: 390, height: 844 } as const;
const TABLET = { width: 820, height: 1180 } as const;

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

async function openAlertOn(
  platform: Platform,
  window: { readonly width: number; readonly height: number },
): Promise<HTMLElement> {
  await page.viewport(window.width, window.height);
  document.documentElement.dataset.platform = platform;
  document.documentElement.dataset.theme = "light";
  await render(ConfirmDialogHarness, { phoneLook: "dialog" });
  const dialog = page.getByRole("alertdialog", { name: "Delete downloads?" });
  await expect.element(dialog).toBeVisible();
  return dialog.element() as HTMLElement;
}

function overlay(): Element {
  const found = document.querySelector(
    "[data-dialog-overlay], [data-alert-dialog-overlay]",
  );
  if (found === null) {
    throw new Error("the alert drew no dimming layer");
  }
  return found;
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

test("draws a choice that destroys nothing in the accent, badge and action alike", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "linux";
  document.documentElement.dataset.theme = "light";
  await render(ConfirmDialogHarness, { tone: "accent" });

  const dialog = page.getByRole("alertdialog", { name: "Delete downloads?" });
  await expect.element(dialog).toBeVisible();
  const badge = dialog.element().querySelector("[aria-hidden='true']");
  const confirm = dialog.getByRole("button", { name: "Delete" }).element();

  expect(badge === null ? "" : getComputedStyle(badge).color).toBe(
    resolvedColour("--primary", "color"),
  );
  expect(getComputedStyle(confirm).backgroundColor).toBe(
    resolvedColour("--primary", "backgroundColor"),
  );
});

test("hovers the accent action in the accent's hover, not the danger's", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "linux";
  document.documentElement.dataset.theme = "light";
  await render(ConfirmDialogHarness, { tone: "accent" });
  const confirm = page.getByRole("button", { name: "Delete" });
  await expect.element(confirm).toBeVisible();

  await userEvent.hover(confirm);

  await expect
    .poll(() => getComputedStyle(confirm.element()).backgroundColor)
    .toBe(resolvedColour("--color-accent-hover", "backgroundColor"));
});

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

test("draws iOS's alert 320 wide on 34 rounded glass, 16 in, over a light dim", async () => {
  const alert = await openAlertOn("ios", PHONE);
  const style = getComputedStyle(alert);

  expect(alert.getBoundingClientRect().width).toBeCloseTo(320, 0);
  expect(style.paddingTop).toBe("16px");
  expect(style.borderTopLeftRadius).toBe("34px");
  expect(style.borderTopWidth).toBe("0px");
  expect(style.backgroundColor).toBe("rgba(247, 247, 247, 0.8)");
  expect(getComputedStyle(overlay()).backgroundColor).toBe(
    "rgba(0, 0, 0, 0.2)",
  );
});

test("sets iOS's alert actions as 48 tall grey capsules with Delete in red words", async () => {
  await openAlertOn("ios", PHONE);
  const remove = page.getByRole("button", { name: "Delete" }).element();
  const style = getComputedStyle(remove);

  expect(remove.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(style.backgroundColor).toBe("rgba(118, 118, 128, 0.12)");
  expect(style.color).toBe(resolvedColour("--destructive", "color"));
  expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThanOrEqual(
    remove.getBoundingClientRect().height / 2,
  );
});

test("keeps today's alert on an iPad", async () => {
  const alert = await openAlertOn("ios", TABLET);

  expect(getComputedStyle(alert).borderTopLeftRadius).toBe("10px");
});

test("keeps today's alert and dim on an Android phone", async () => {
  const alert = await openAlertOn("android", PHONE);

  expect(getComputedStyle(alert).borderTopLeftRadius).not.toBe("34px");
  expect(getComputedStyle(overlay()).backgroundColor).toBe(
    resolvedColour("--overlay", "backgroundColor"),
  );
});
