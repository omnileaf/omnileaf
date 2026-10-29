import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Button from "./button.svelte";

interface NativeButtonLook {
  readonly platform: Platform;
  readonly height: number;
  readonly target: string;
  readonly fill: string;
  readonly darkFill: string;
  readonly secondaryFill: string;
}

const NATIVE_LOOKS: readonly NativeButtonLook[] = [
  {
    platform: "ios",
    height: 34,
    target: "44px",
    fill: "rgb(47, 111, 79)",
    darkFill: "rgb(127, 203, 157)",
    secondaryFill: "rgba(118, 118, 128, 0.12)",
  },
  {
    platform: "android",
    height: 40,
    target: "48px",
    fill: "rgb(50, 106, 77)",
    darkFill: "rgb(164, 209, 180)",
    secondaryFill: "rgb(208, 232, 215)",
  },
];

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];

const CAPSULE = "999px";

const label = createRawSnippet(() => ({ render: () => "<span>Remove</span>" }));

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

for (const platform of PLATFORMS) {
  test(`says it's busy and ignores a second press while it works on ${platform}`, async () => {
    followCorePlatform(platform);
    let presses = 0;
    let finish = (): void => undefined;
    await render(Button, {
      look: "dialog-primary",
      type: "button",
      children: label,
      onClickPromise: () => {
        presses += 1;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    });
    const button = page.getByRole("button", { name: "Remove" });

    await button.click();
    await button.click({ force: true });

    await expect.element(button).toHaveAttribute("aria-busy", "true");
    expect(presses).toBe(1);
    finish();
  });
}

for (const look of NATIVE_LOOKS) {
  test(`draws a dialog's main button as ${look.platform}'s own button`, async () => {
    followCorePlatform(look.platform);
    document.documentElement.dataset.theme = "light";
    await render(Button, {
      look: "dialog-primary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();
    const style = getComputedStyle(button);

    expect(button.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(style.borderTopLeftRadius).toBe(CAPSULE);
    expect(style.backgroundColor).toBe(look.fill);
  });

  test(`gives ${look.platform}'s button its full touch target`, async () => {
    followCorePlatform(look.platform);
    await render(Button, {
      look: "dialog-primary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();
    const target = getComputedStyle(button, "::before").height;

    expect(target).toBe(look.target);
  });

  test(`draws ${look.platform}'s button in its dark colours inside a dark part of the page`, async () => {
    followCorePlatform(look.platform);
    document.documentElement.dataset.theme = "light";
    const darkPart = document.createElement("main");
    darkPart.dataset.theme = "dark";
    document.body.append(darkPart);
    await render(Button, {
      target: darkPart,
      props: { look: "dialog-primary", type: "button", children: label },
    });

    const button = page.getByRole("button", { name: "Remove" }).element();

    expect(getComputedStyle(button).backgroundColor).toBe(look.darkFill);
    darkPart.remove();
  });
}

for (const look of NATIVE_LOOKS) {
  test(`draws a dialog's other button as ${look.platform}'s secondary button`, async () => {
    followCorePlatform(look.platform);
    document.documentElement.dataset.theme = "light";
    await render(Button, {
      look: "dialog-secondary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();
    const style = getComputedStyle(button);

    expect(button.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(style.borderTopLeftRadius).toBe(CAPSULE);
    expect(style.backgroundColor).toBe(look.secondaryFill);
  });
}

type MacosVariant =
  "primary" | "secondary" | "outline" | "plain" | "destructive" | "link";

interface MacosOptions {
  readonly variant?: MacosVariant;
  readonly size?: "small" | "regular" | "large";
  readonly iconOnly?: boolean;
  readonly disabled?: boolean;
  readonly theme?: "light" | "dark";
}

async function macosButton(options: MacosOptions = {}): Promise<HTMLElement> {
  document.body.replaceChildren();
  followCorePlatform("macos");
  document.documentElement.dataset.theme = options.theme ?? "light";
  await render(Button, {
    variant: options.variant ?? "secondary",
    size: options.size ?? "regular",
    iconOnly: options.iconOnly ?? false,
    disabled: options.disabled ?? false,
    label: "Remove",
    type: "button",
    children: label,
  });
  return page.getByRole("button", { name: "Remove" }).element();
}

function sizeOf(button: HTMLElement): { width: number; height: number } {
  const { width, height } = button.getBoundingClientRect();
  return { width, height };
}

function isCapsule(button: HTMLElement): boolean {
  const { height } = sizeOf(button);
  return (
    Number.parseFloat(getComputedStyle(button).borderTopLeftRadius) >=
    height / 2
  );
}

test("draws macOS's regular button 24px tall with 6px corners and 13px type at weight 510", async () => {
  const button = await macosButton({ variant: "primary" });
  const style = getComputedStyle(button);

  expect({
    height: sizeOf(button).height,
    radius: style.borderTopLeftRadius,
    fill: style.backgroundColor,
    ink: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    gap: style.columnGap,
  }).toEqual({
    height: 24,
    radius: "6px",
    fill: "rgb(47, 111, 79)",
    ink: "rgb(255, 255, 255)",
    fontSize: "13px",
    fontWeight: "510",
    gap: "4px",
  });
});

test("steps macOS's buttons 20, 24 and 28 tall, with the large one a capsule", async () => {
  const heights: Record<string, number> = {};
  for (const size of ["small", "regular", "large"] as const) {
    document.body.replaceChildren();
    const button = await macosButton({ size });
    heights[size] = sizeOf(button).height;
  }
  const large = await macosButton({ size: "large" });

  expect(heights).toEqual({ small: 20, regular: 24, large: 28 });
  expect(isCapsule(large)).toBe(true);
});

test("sets macOS's small button in 11px type with 9px sides and 5px corners", async () => {
  const style = getComputedStyle(await macosButton({ size: "small" }));

  expect([
    style.fontSize,
    style.paddingInlineStart,
    style.borderTopLeftRadius,
  ]).toEqual(["11px", "9px", "5px"]);
});

test("draws macOS's icon-only buttons square to their height, as capsules on a faint fill", async () => {
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const size of ["small", "regular", "large"] as const) {
    document.body.replaceChildren();
    sizes[size] = sizeOf(await macosButton({ size, iconOnly: true }));
  }
  const regular = await macosButton({ iconOnly: true });

  expect(sizes).toEqual({
    small: { width: 20, height: 20 },
    regular: { width: 24, height: 24 },
    large: { width: 28, height: 28 },
  });
  expect(isCapsule(regular)).toBe(true);
  expect(getComputedStyle(regular).backgroundColor).toBe(
    resolvedColour("--color-native-icon-button-fill", "backgroundColor"),
  );
});

test("draws macOS's secondary button on the control fill, in the label colour", async () => {
  const style = getComputedStyle(await macosButton());

  expect([style.backgroundColor, style.color]).toEqual([
    "rgba(0, 0, 0, 0.08)",
    "rgba(0, 0, 0, 0.85)",
  ]);
});

test("darkens macOS's secondary fill under the pointer", async () => {
  const button = await macosButton();

  await page.getByRole("button", { name: "Remove" }).hover();

  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe("rgba(0, 0, 0, 0.11)");
});

test("draws macOS's destructive button in the soft red with a red label", async () => {
  const style = getComputedStyle(await macosButton({ variant: "destructive" }));

  expect([style.backgroundColor, style.color]).toEqual([
    "rgb(246, 227, 227)",
    "rgb(155, 44, 44)",
  ]);
});

test("draws macOS's plain button without a fill, in the label colour", async () => {
  const style = getComputedStyle(await macosButton({ variant: "plain" }));

  expect([style.backgroundColor, style.color]).toEqual([
    "rgba(0, 0, 0, 0)",
    "rgba(0, 0, 0, 0.85)",
  ]);
});

test("draws macOS's link button as bare accent text that underlines under the pointer", async () => {
  const button = await macosButton({ variant: "link" });
  const style = getComputedStyle(button);

  expect({
    height: sizeOf(button).height,
    padding: style.paddingInlineStart,
    fill: style.backgroundColor,
    ink: style.color,
    underlined: style.textDecorationLine.includes("underline"),
  }).toEqual({
    height: 16,
    padding: "0px",
    fill: "rgba(0, 0, 0, 0)",
    ink: "rgb(47, 111, 79)",
    underlined: false,
  });

  await page.getByRole("button", { name: "Remove" }).hover();

  expect(getComputedStyle(button).textDecorationLine).toContain("underline");
});

test("greys macOS's disabled buttons and stops them taking the pointer", async () => {
  const enabled = getComputedStyle(await macosButton());
  const enabledFill = enabled.backgroundColor;
  document.body.replaceChildren();
  const disabled = getComputedStyle(await macosButton({ disabled: true }));

  expect({
    changesFill: disabled.backgroundColor !== enabledFill,
    ink: disabled.color,
    pointer: disabled.pointerEvents,
  }).toEqual({
    changesFill: true,
    ink: "rgba(0, 0, 0, 0.25)",
    pointer: "none",
  });
});

test("draws macOS's button in its dark colours inside a dark part of the page", async () => {
  followCorePlatform("macos");
  document.documentElement.dataset.theme = "light";
  const darkPart = document.createElement("main");
  darkPart.dataset.theme = "dark";
  document.body.append(darkPart);
  await render(Button, {
    target: darkPart,
    props: { variant: "primary", type: "button", children: label },
  });

  const button = page.getByRole("button", { name: "Remove" }).element();

  expect(getComputedStyle(button).backgroundColor).toBe("rgb(46, 125, 85)");
  darkPart.remove();
});

test("lightens macOS's secondary label in the dark theme", async () => {
  const style = getComputedStyle(await macosButton({ theme: "dark" }));

  expect([style.backgroundColor, style.color]).toEqual([
    "rgba(255, 255, 255, 0.07)",
    "rgba(255, 255, 255, 0.85)",
  ]);
});

for (const platform of ["linux", "windows"] as const) {
  test(`keeps a primary button on ${platform} taller than macOS's, as it was`, async () => {
    followCorePlatform(platform);
    await render(Button, {
      variant: "primary",
      type: "button",
      children: label,
    });

    const button = page.getByRole("button", { name: "Remove" }).element();

    expect(button.getBoundingClientRect().height).toBeGreaterThan(24);
  });
}
