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
    fill: "rgb(243, 243, 243)",
    edge: "rgba(117, 117, 117, 0.4)",
    shadow: "--native-shadow-dialog-lift",
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

interface WindowsDialogLook {
  readonly band: string;
  readonly layer: string;
  readonly bandEdge: string;
  readonly accent: string;
  readonly busyFill: string;
}

const WINDOWS_DIALOGS = {
  light: {
    band: "rgb(243, 243, 243)",
    layer: "rgb(255, 255, 255)",
    bandEdge: "rgba(0, 0, 0, 0.06)",
    accent: "rgb(47, 111, 79)",
    busyFill: "rgba(0, 0, 0, 0.216)",
  },
  dark: {
    band: "rgb(32, 32, 32)",
    layer: "rgba(255, 255, 255, 0.05)",
    bandEdge: "rgba(0, 0, 0, 0.098)",
    accent: "rgb(127, 203, 157)",
    busyFill: "rgba(255, 255, 255, 0.157)",
  },
} as const satisfies Record<"light" | "dark", WindowsDialogLook>;

async function openWindowsDialog(
  theme: string,
  props: { isBusy?: boolean; tone?: "danger" | "accent" } = {},
): Promise<HTMLElement> {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = theme;
  await render(ConfirmDialogHarness, props);
  const dialog = page.getByRole("alertdialog", { name: "Delete downloads?" });
  await expect.element(dialog).toBeVisible();
  return dialog.element() as HTMLElement;
}

function bandOf(dialog: HTMLElement): HTMLElement {
  const band = dialog
    .querySelector("button")
    ?.closest<HTMLElement>("div:has(> button + button)");
  if (band === null || band === undefined) {
    throw new Error("the dialog drew no button band");
  }
  return band;
}

for (const [theme, look] of Object.entries(WINDOWS_DIALOGS)) {
  test(`draws Windows's ContentDialog in the ${theme} theme 448 wide on the layer, 24 in, with a Title-sized heading and no badge`, async () => {
    const dialog = await openWindowsDialog(theme);
    const style = getComputedStyle(dialog);
    const title = page.getByRole("heading", { name: "Delete downloads?" });
    const badge = dialog.querySelector("[aria-hidden='true']");

    expect(dialog.getBoundingClientRect().width).toBeCloseTo(448, 0);
    expect(style.paddingTop).toBe("24px");
    expect(style.paddingInlineStart).toBe("24px");
    expect(style.backgroundColor).toBe(look.band);
    expect(style.backgroundImage).toContain(look.layer);
    expect(getComputedStyle(title.element()).fontSize).toBe("20px");
    expect(getComputedStyle(title.element()).fontWeight).toBe("600");
    expect(badge === null ? "none" : getComputedStyle(badge).display).toBe(
      "none",
    );
  });

  test(`sets Windows's dialog buttons on a darker band across the dialog's foot under a stroke in the ${theme} theme`, async () => {
    const dialog = await openWindowsDialog(theme);
    const band = bandOf(dialog);
    const style = getComputedStyle(band);
    const box = band.getBoundingClientRect();
    const frame = dialog.getBoundingClientRect();
    const edge = 1;

    expect(style.backgroundColor).toBe(look.band);
    expect(style.backgroundImage).toBe("none");
    expect(style.borderTopWidth).toBe("1px");
    expect(style.borderTopColor).toBe(look.bandEdge);
    expect(style.padding).toBe("24px");
    expect(style.columnGap).toBe("8px");
    expect(box.left).toBeCloseTo(frame.left + edge, 0);
    expect(box.right).toBeCloseTo(frame.right - edge, 0);
    expect(box.bottom).toBeCloseTo(frame.bottom - edge, 0);
  });

  test(`leads Windows's dialog buttons with the action in the accent, never red, in the ${theme} theme`, async () => {
    const dialog = await openWindowsDialog(theme);
    const [first, second] = [...bandOf(dialog).querySelectorAll("button")];

    expect(first?.textContent.trim()).toBe("Delete");
    expect(second?.textContent.trim()).toBe("Cancel");
    expect(first && getComputedStyle(first).backgroundColor).toBe(look.accent);
  });

  test(`fills Windows's busy action with the accent's disabled fill in the ${theme} theme`, async () => {
    await openWindowsDialog(theme, { isBusy: true });
    const action = page.getByRole("button", { name: "Delete" }).element();

    expect(getComputedStyle(action).backgroundColor).toBe(look.busyFill);
  });
}

test.each<Platform>(["linux", "windows"])(
  "lands focus on Cancel when a %s confirmation opens, so Enter never confirms by accident",
  async (platform) => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.theme = "light";

    await render(ConfirmDialogHarness);

    await expect
      .element(page.getByRole("button", { name: "Cancel" }))
      .toHaveFocus();
  },
);

test("opens a Windows confirmation as a dialog in a narrow window too, as Windows has no bottom sheets", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  await render(ConfirmDialogHarness);
  const dialog = page.getByRole("alertdialog", { name: "Delete downloads?" });
  await expect.element(dialog).toBeVisible();

  const box = dialog.element().getBoundingClientRect();

  expect(PHONE.height - box.bottom).toBeGreaterThan(0);
  expect(getComputedStyle(dialog.element()).borderTopLeftRadius).toBe("8px");
  expect(getComputedStyle(dialog.element()).borderBottomLeftRadius).toBe("8px");
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
