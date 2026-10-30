import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Button from "./button.svelte";
import type { ButtonSize, ButtonVariant } from "./looks.ts";

const label = createRawSnippet(() => ({ render: () => "<span>Remove</span>" }));

const TRANSPARENT = "rgba(0, 0, 0, 0)";

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];

interface WindowsOptions {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly iconOnly?: boolean;
  readonly disabled?: boolean;
  readonly theme?: "light" | "dark";
}

async function windowsButton(
  options: WindowsOptions = {},
): Promise<HTMLElement> {
  document.body.replaceChildren();
  followCorePlatform("windows");
  document.documentElement.dataset.theme = options.theme ?? "light";
  await render(Button, {
    variant: options.variant ?? "secondary",
    size: options.size ?? "regular",
    disabled: options.disabled ?? false,
    type: "button",
    children: label,
    ...(options.iconOnly === true
      ? { iconOnly: true as const, label: "Remove" }
      : {}),
  });
  const element = page.getByRole("button", { name: "Remove" }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the button drew no element");
  }
  return element;
}

interface Edges {
  readonly top: string;
  readonly side: string;
  readonly bottom: string;
}

function edgesOf(style: CSSStyleDeclaration): Edges {
  return {
    top: style.borderTopColor,
    side: style.borderLeftColor,
    bottom: style.borderBottomColor,
  };
}

function visibleShadows(boxShadow: string): string[] {
  return boxShadow
    .split(/,(?![^(]*\))/)
    .map((shadow) => shadow.trim())
    .filter((shadow) => !shadow.startsWith(TRANSPARENT));
}

function sizeOf(button: HTMLElement): { width: number; height: number } {
  const { width, height } = button.getBoundingClientRect();
  return { width, height };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws Windows's accent button 32 tall with 4px corners, 14px type at weight 400 and 11px sides", async () => {
  const button = await windowsButton({ variant: "primary" });
  const style = getComputedStyle(button);

  expect({
    height: sizeOf(button).height,
    radius: style.borderTopLeftRadius,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    fontWeight: style.fontWeight,
    sides: style.paddingInlineStart,
    gap: style.columnGap,
    fill: style.backgroundColor,
    ink: style.color,
    edges: edgesOf(style),
  }).toEqual({
    height: 32,
    radius: "4px",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: "400",
    sides: "11px",
    gap: "8px",
    fill: "rgb(47, 111, 79)",
    ink: "rgb(255, 255, 255)",
    edges: {
      top: "rgba(255, 255, 255, 0.08)",
      side: "rgba(255, 255, 255, 0.08)",
      bottom: "rgba(0, 0, 0, 0.4)",
    },
  });
});

test("draws Windows's standard button on the control fill with a darker bottom edge", async () => {
  const style = getComputedStyle(await windowsButton());

  expect({
    fill: style.backgroundColor,
    ink: style.color,
    edges: edgesOf(style),
  }).toEqual({
    fill: "rgba(255, 255, 255, 0.7)",
    ink: "rgba(0, 0, 0, 0.894)",
    edges: {
      top: "rgba(0, 0, 0, 0.06)",
      side: "rgba(0, 0, 0, 0.06)",
      bottom: "rgba(0, 0, 0, 0.16)",
    },
  });
});

test("lights Windows's standard button along its top edge in the dark theme", async () => {
  const style = getComputedStyle(await windowsButton({ theme: "dark" }));

  expect({
    fill: style.backgroundColor,
    ink: style.color,
    edges: edgesOf(style),
  }).toEqual({
    fill: "rgba(255, 255, 255, 0.06)",
    ink: "rgb(255, 255, 255)",
    edges: {
      top: "rgba(255, 255, 255, 0.094)",
      side: "rgba(255, 255, 255, 0.07)",
      bottom: "rgba(255, 255, 255, 0.07)",
    },
  });
});

test("draws Windows's accent button in the light green with black text in the dark theme", async () => {
  const style = getComputedStyle(
    await windowsButton({ variant: "primary", theme: "dark" }),
  );

  expect([style.backgroundColor, style.color, style.borderBottomColor]).toEqual(
    ["rgb(127, 203, 157)", "rgb(0, 0, 0)", "rgba(0, 0, 0, 0.137)"],
  );
});

for (const variant of ["secondary", "outline", "destructive"] as const) {
  test(`draws Windows's ${variant} button as the standard button, never red`, async () => {
    const standard = getComputedStyle(await windowsButton());
    const standardLook = [
      standard.backgroundColor,
      standard.color,
      standard.borderBottomColor,
    ];
    const style = getComputedStyle(await windowsButton({ variant }));

    expect([
      style.backgroundColor,
      style.color,
      style.borderBottomColor,
    ]).toEqual(standardLook);
  });
}

test("draws Windows's subtle button with no fill and no edge until the pointer is over it", async () => {
  const button = await windowsButton({ variant: "plain" });
  const style = getComputedStyle(button);

  expect([style.backgroundColor, style.color, style.borderTopColor]).toEqual([
    TRANSPARENT,
    "rgba(0, 0, 0, 0.894)",
    TRANSPARENT,
  ]);

  await page.getByRole("button", { name: "Remove" }).hover();

  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe("rgba(0, 0, 0, 0.035)");
  await userEvent.unhover(page.getByRole("button", { name: "Remove" }));
});

test("draws Windows's hyperlink button in the accent text colour with no fill", async () => {
  const style = getComputedStyle(await windowsButton({ variant: "link" }));

  expect([style.backgroundColor, style.color, style.borderTopColor]).toEqual([
    TRANSPARENT,
    "rgb(0, 76, 47)",
    TRANSPARENT,
  ]);
});

test("lifts Windows's standard fill under the pointer", async () => {
  const button = await windowsButton();

  await page.getByRole("button", { name: "Remove" }).hover();

  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe("rgba(249, 249, 249, 0.5)");
  await userEvent.unhover(page.getByRole("button", { name: "Remove" }));
});

test("takes the accent fill to 90% under the pointer", async () => {
  const button = await windowsButton({ variant: "primary" });

  await page.getByRole("button", { name: "Remove" }).hover();

  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .toBe("rgba(47, 111, 79, 0.9)");
  await userEvent.unhover(page.getByRole("button", { name: "Remove" }));
});

test("greys Windows's disabled standard button and stops it taking the pointer", async () => {
  const style = getComputedStyle(await windowsButton({ disabled: true }));

  expect([style.backgroundColor, style.color, style.pointerEvents]).toEqual([
    "rgba(249, 249, 249, 0.3)",
    "rgba(0, 0, 0, 0.447)",
    "none",
  ]);
});

test("draws Windows's disabled accent button on the grey accent fill with white text and no edge", async () => {
  const style = getComputedStyle(
    await windowsButton({ variant: "primary", disabled: true }),
  );

  expect([style.backgroundColor, style.color, style.borderBottomColor]).toEqual(
    ["rgba(0, 0, 0, 0.216)", "rgb(255, 255, 255)", TRANSPARENT],
  );
});

test("steps Windows's buttons 24 and 32 tall, with the large one as tall as the regular", async () => {
  const heights: Record<string, number> = {};
  for (const size of ["small", "regular", "large"] as const) {
    heights[size] = sizeOf(await windowsButton({ size })).height;
  }
  const small = getComputedStyle(await windowsButton({ size: "small" }));

  expect(heights).toEqual({ small: 24, regular: 32, large: 32 });
  expect(small.paddingInlineStart).toBe("7px");
});

test("draws Windows's icon-only buttons square to their height", async () => {
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const size of ["small", "regular"] as const) {
    sizes[size] = sizeOf(
      await windowsButton({ variant: "plain", size, iconOnly: true }),
    );
  }

  expect(sizes).toEqual({
    small: { width: 24, height: 24 },
    regular: { width: 32, height: 32 },
  });
});

test("rings a focused Windows button with the two-tone focus rectangle", async () => {
  await windowsButton();

  await userEvent.tab();
  const style = getComputedStyle(
    page.getByRole("button", { name: "Remove" }).element(),
  );

  expect({
    outline: [style.outlineStyle, style.outlineWidth, style.outlineColor],
    offset: style.outlineOffset,
    inner: visibleShadows(style.boxShadow),
  }).toEqual({
    outline: ["solid", "2px", "rgba(0, 0, 0, 0.894)"],
    offset: "1px",
    inner: ["rgba(255, 255, 255, 0.7) 0px 0px 0px 1px"],
  });
});

test("turns the focus rectangle white around a black inner line in the dark theme", async () => {
  await windowsButton({ theme: "dark" });

  await userEvent.tab();
  const style = getComputedStyle(
    page.getByRole("button", { name: "Remove" }).element(),
  );

  expect([style.outlineColor, visibleShadows(style.boxShadow)]).toEqual([
    "rgb(255, 255, 255)",
    ["rgba(0, 0, 0, 0.7) 0px 0px 0px 1px"],
  ]);
});

for (const platform of PLATFORMS) {
  test(`keeps a variant button's role, name and one press per click on ${platform}`, async () => {
    followCorePlatform(platform);
    let presses = 0;
    await render(Button, {
      variant: "destructive",
      type: "button",
      children: label,
      onclick: () => {
        presses += 1;
      },
    });
    const button = page.getByRole("button", { name: "Remove" });

    await button.click();

    expect(button.element().tagName).toBe("BUTTON");
    expect(presses).toBe(1);
  });

  test(`names an icon-only variant button by its label on ${platform}`, async () => {
    followCorePlatform(platform);
    await render(Button, {
      variant: "plain",
      iconOnly: true,
      label: "Remove",
      type: "button",
      children: label,
    });

    await expect
      .element(page.getByRole("button", { name: "Remove" }))
      .toBeVisible();
  });
}
