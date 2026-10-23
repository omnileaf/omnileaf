import { type ComponentProps, createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Button from "./button.svelte";
import type { ButtonSize, ButtonVariant } from "./looks.ts";

const TRANSPARENT = "rgba(0, 0, 0, 0)";

const label = createRawSnippet(() => ({ render: () => "<span>Add</span>" }));

interface VariantLook {
  readonly fill: string;
  readonly text: string;
  readonly edge: string;
}

const TARGETS: Record<"ios" | "android", string> = {
  ios: "44px",
  android: "48px",
};

const VARIANTS: Record<
  "ios" | "android",
  Record<ButtonVariant, VariantLook>
> = {
  ios: {
    primary: {
      fill: "rgb(47, 111, 79)",
      text: "rgb(255, 255, 255)",
      edge: TRANSPARENT,
    },
    secondary: {
      fill: "rgba(118, 118, 128, 0.12)",
      text: "rgb(47, 111, 79)",
      edge: TRANSPARENT,
    },
    outline: {
      fill: "rgba(118, 118, 128, 0.12)",
      text: "rgb(47, 111, 79)",
      edge: TRANSPARENT,
    },
    plain: { fill: TRANSPARENT, text: "rgb(47, 111, 79)", edge: TRANSPARENT },
    link: { fill: TRANSPARENT, text: "rgb(47, 111, 79)", edge: TRANSPARENT },
    destructive: {
      fill: "rgb(246, 227, 227)",
      text: "rgb(155, 44, 44)",
      edge: TRANSPARENT,
    },
  },
  android: {
    primary: {
      fill: "rgb(50, 106, 77)",
      text: "rgb(230, 255, 237)",
      edge: TRANSPARENT,
    },
    secondary: {
      fill: "rgb(208, 232, 215)",
      text: "rgb(65, 87, 73)",
      edge: TRANSPARENT,
    },
    outline: {
      fill: TRANSPARENT,
      text: "rgb(50, 106, 77)",
      edge: "rgb(115, 125, 117)",
    },
    plain: { fill: TRANSPARENT, text: "rgb(50, 106, 77)", edge: TRANSPARENT },
    link: { fill: TRANSPARENT, text: "rgb(50, 106, 77)", edge: TRANSPARENT },
    destructive: {
      fill: TRANSPARENT,
      text: "rgb(168, 56, 54)",
      edge: TRANSPARENT,
    },
  },
};

const HEIGHTS: Record<"ios" | "android", Record<ButtonSize, number>> = {
  ios: { small: 28, regular: 34, large: 50 },
  android: { small: 32, regular: 40, large: 56 },
};

const NATIVE: readonly ("ios" | "android")[] = ["ios", "android"];

async function renderButton(
  platform: Platform,
  props: ComponentProps<typeof Button>,
): Promise<HTMLElement> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await render(Button, { ...props, type: "button", children: label });
  const button = page.getByRole("button").element();
  if (!(button instanceof HTMLElement)) {
    throw new Error("no button was drawn");
  }
  return button;
}

function visibleEdge(style: CSSStyleDeclaration): string {
  return style.borderTopWidth === "0px" ? TRANSPARENT : style.borderTopColor;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

for (const platform of NATIVE) {
  for (const [variant, look] of Object.entries(VARIANTS[platform])) {
    test(`draws the ${variant} variant as ${platform} draws it`, async () => {
      const button = await renderButton(platform, {
        variant: variant as ButtonVariant,
      });
      const style = getComputedStyle(button);

      expect(style.backgroundColor).toBe(look.fill);
      expect(style.color).toBe(look.text);
      expect(visibleEdge(style)).toBe(look.edge);
      expect(style.borderTopLeftRadius).toBe("999px");
    });
  }

  for (const [size, height] of Object.entries(HEIGHTS[platform])) {
    test(`sizes a ${size} button ${String(height)} tall on ${platform}`, async () => {
      const button = await renderButton(platform, {
        variant: "secondary",
        size: size as ButtonSize,
      });

      expect(button.getBoundingClientRect().height).toBeCloseTo(height, 0);
    });
  }

  test(`draws an icon-only button as a ${platform} circle named by its label`, async () => {
    const button = await renderButton(platform, {
      variant: "plain",
      iconOnly: true,
      label: "Add folder",
    });
    const box = button.getBoundingClientRect();

    expect(button.getAttribute("aria-label")).toBe("Add folder");
    expect(box.width).toBeCloseTo(box.height, 0);
    expect(box.height).toBeCloseTo(HEIGHTS[platform].regular, 0);
  });

  test(`gives a small icon-only button ${platform}'s full touch target both ways`, async () => {
    const button = await renderButton(platform, {
      variant: "plain",
      size: "small",
      iconOnly: true,
      label: "Add folder",
    });
    const target = getComputedStyle(button, "::before");

    expect(target.width).toBe(TARGETS[platform]);
    expect(target.height).toBe(TARGETS[platform]);
  });
}

test("keeps today's dialog buttons for the variants on Linux", async () => {
  const button = await renderButton("linux", { variant: "primary" });

  expect(button.className).toContain("bg-accent");
});

test("shows only the spinner in a busy icon-only button", async () => {
  let finish = (): void => undefined;
  const button = await renderButton("ios", {
    variant: "plain",
    iconOnly: true,
    label: "Add folder",
    onClickPromise: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });

  button.click();

  await expect.element(button).toHaveAttribute("aria-busy", "true");
  expect(button.textContent).not.toContain("Add");
  finish();
});

test("keeps an icon-only button square on Linux", async () => {
  const button = await renderButton("linux", {
    variant: "plain",
    iconOnly: true,
    label: "Add folder",
  });
  const box = button.getBoundingClientRect();

  expect(box.width).toBeCloseTo(box.height, 0);
});

test("draws a link in the accent colour on Linux", async () => {
  const button = await renderButton("linux", { variant: "link" });

  expect(button.className.split(" ")).toContain("text-accent");
});
