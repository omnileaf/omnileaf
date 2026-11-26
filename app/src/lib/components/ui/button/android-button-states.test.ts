import { createRawSnippet } from "svelte";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import Button from "./button.svelte";
import type { ButtonSize, ButtonVariant } from "./looks.ts";

type Theme = "light" | "dark";

interface KitColours {
  readonly disabledFill: string;
  readonly disabledLabel: string;
  readonly muted: string;
  readonly mutedLayer: string;
  readonly outline: string;
  readonly focusRing: string;
  readonly onPrimaryLayer: string;
}

const KIT: Record<Theme, KitColours> = {
  light: {
    disabledFill: "rgba(44, 53, 46, 0.1)",
    disabledLabel: "rgba(44, 53, 46, 0.38)",
    muted: "rgb(88, 97, 90)",
    mutedLayer: "rgba(88, 97, 90, 0.1)",
    outline: "rgb(115, 125, 117)",
    focusRing: "rgb(78, 100, 86)",
    onPrimaryLayer: "rgba(230, 255, 237, 0.1)",
  },
  dark: {
    disabledFill: "rgba(222, 232, 223, 0.1)",
    disabledLabel: "rgba(222, 232, 223, 0.38)",
    muted: "rgb(164, 174, 165)",
    mutedLayer: "rgba(164, 174, 165, 0.1)",
    outline: "rgb(110, 120, 112)",
    focusRing: "rgb(180, 204, 187)",
    onPrimaryLayer: "rgba(0, 57, 29, 0.1)",
  },
};

const THEMES: readonly Theme[] = ["light", "dark"];
const NO_FILL = "rgba(0, 0, 0, 0)";
const FILLED: readonly ButtonVariant[] = ["primary", "secondary"];
const TEXT: readonly ButtonVariant[] = ["plain", "link", "destructive"];

const ICON_IN_LABELLED: Record<ButtonSize, number> = {
  small: 20,
  regular: 20,
  large: 24,
};

const LUCIDE_SIZE = 16;

const labelled = createRawSnippet(() => ({
  render: () => "<span>Add</span>",
}));

const labelledWithIcon = createRawSnippet(() => ({
  render: () =>
    `<svg data-testid="icon" width="${String(LUCIDE_SIZE)}" height="${String(LUCIDE_SIZE)}" viewBox="0 0 24 24"></svg>`,
}));

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

async function renderButton(
  platform: Platform,
  theme: Theme,
  props: Record<string, unknown>,
): Promise<HTMLElement> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await render(Button, { type: "button", children: labelled, ...props });
  const button = page.getByRole("button").element();
  if (!(button instanceof HTMLElement)) {
    throw new Error("the button drew no element");
  }
  return button;
}

for (const theme of THEMES) {
  const kit = KIT[theme];

  for (const variant of FILLED) {
    test(`greys a disabled ${variant} Android button the kit's way in the ${theme} theme`, async () => {
      const button = await renderButton("android", theme, {
        variant,
        disabled: true,
      });

      const style = getComputedStyle(button);

      expect(style.backgroundColor).toBe(kit.disabledFill);
      expect(style.color).toBe(kit.disabledLabel);
    });
  }

  test(`greys a disabled outlined Android button's outline and label in the ${theme} theme`, async () => {
    const button = await renderButton("android", theme, {
      variant: "outline",
      disabled: true,
    });

    const style = getComputedStyle(button);

    expect(style.backgroundColor).toBe(NO_FILL);
    expect(style.borderTopColor).toBe(kit.disabledFill);
    expect(style.color).toBe(kit.disabledLabel);
  });

  for (const variant of TEXT) {
    test(`greys only the label of a disabled ${variant} Android button in the ${theme} theme`, async () => {
      const button = await renderButton("android", theme, {
        variant,
        disabled: true,
      });

      const style = getComputedStyle(button);

      expect(style.backgroundColor).toBe(NO_FILL);
      expect(style.color).toBe(kit.disabledLabel);
    });
  }

  test(`draws an outlined Android button's label in the muted colour inside the outline in the ${theme} theme`, async () => {
    const button = await renderButton("android", theme, {
      variant: "outline",
    });

    const style = getComputedStyle(button);

    expect(style.color).toBe(kit.muted);
    expect(style.borderTopColor).toBe(kit.outline);
    expect(style.borderTopWidth).toBe("1px");
  });

  test(`draws a standard Android icon button in the muted colour in the ${theme} theme`, async () => {
    const button = await renderButton("android", theme, {
      variant: "plain",
      iconOnly: true,
      label: "Find a book",
    });

    expect(getComputedStyle(button).color).toBe(kit.muted);
  });

  test(`rings a focused Android button in the focus colour, 3px out by 2px, over a state layer in the ${theme} theme`, async () => {
    const button = await renderButton("android", theme, {
      variant: "primary",
    });

    await userEvent.tab();
    await expect.element(button).toHaveFocus();
    const style = getComputedStyle(button);

    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("3px");
    expect(style.outlineOffset).toBe("2px");
    expect(style.outlineColor).toBe(kit.focusRing);
    expect(style.backgroundImage).toBe(
      `linear-gradient(${kit.onPrimaryLayer}, ${kit.onPrimaryLayer})`,
    );
  });

  test(`lays the muted colour over a focused outlined Android button in the ${theme} theme`, async () => {
    const button = await renderButton("android", theme, {
      variant: "outline",
    });

    await userEvent.tab();
    await expect.element(button).toHaveFocus();

    expect(getComputedStyle(button).backgroundImage).toBe(
      `linear-gradient(${kit.mutedLayer}, ${kit.mutedLayer})`,
    );
  });
}

for (const [size, icon] of Object.entries(ICON_IN_LABELLED)) {
  test(`sizes the icon in a ${size} labelled Android button to ${String(icon)}px`, async () => {
    await renderButton("android", "light", {
      variant: "primary",
      size,
      children: labelledWithIcon,
    });

    const drawn = page.getByTestId("icon").element().getBoundingClientRect();

    expect(drawn.width).toBe(icon);
    expect(drawn.height).toBe(icon);
  });
}

test("keeps an iOS disabled button, outlined label, focus and icon as they were", async () => {
  const disabled = await renderButton("ios", "light", {
    variant: "primary",
    disabled: true,
    children: labelledWithIcon,
  });

  const icon = page.getByTestId("icon").element().getBoundingClientRect();

  expect(getComputedStyle(disabled).backgroundColor).toBe("rgb(47, 111, 79)");
  expect(getComputedStyle(disabled).color).toBe("rgb(255, 255, 255)");
  expect(icon.width).toBe(LUCIDE_SIZE);
});

test("keeps an iOS outlined button's accent label and an unlayered focus", async () => {
  const button = await renderButton("ios", "light", { variant: "outline" });

  await userEvent.tab();
  await expect.element(button).toHaveFocus();
  const style = getComputedStyle(button);

  expect(style.color).toBe("rgb(47, 111, 79)");
  expect(style.backgroundImage).toBe("none");
});

const RESTING_RADIUS: Record<ButtonSize, string> = {
  small: "16px",
  regular: "20px",
  large: "28px",
};

for (const [size, radius] of Object.entries(RESTING_RADIUS)) {
  test(`rounds a resting ${size} Android button to half its height`, async () => {
    const labelledButton = await renderButton("android", "light", {
      variant: "primary",
      size,
    });

    expect(getComputedStyle(labelledButton).borderTopLeftRadius).toBe(radius);
    expect(labelledButton.getBoundingClientRect().height / 2).toBe(
      Number.parseFloat(radius),
    );
  });

  test(`rounds a resting ${size} Android icon button to half its height`, async () => {
    const iconButton = await renderButton("android", "light", {
      variant: "secondary",
      size,
      iconOnly: true,
      label: "Add",
    });

    expect(getComputedStyle(iconButton).borderTopLeftRadius).toBe(radius);
  });
}

test("morphs a pressed Android button's corners on the kit's spring while navigation moves", async () => {
  const moving = await renderButton("android", "light", { variant: "primary" });

  const durations = getComputedStyle(moving).transitionDuration.split(", ");

  expect(durations.at(-1)).toBe("0.383s");
});

test("holds a pressed Android button's corners still when navigation animations are off", async () => {
  document.documentElement.dataset.still = "navigation";
  const still = await renderButton("android", "light", { variant: "primary" });

  const durations = getComputedStyle(still).transitionDuration.split(", ");
  delete document.documentElement.dataset.still;

  expect(durations.at(-1)).toBe("0s");
});
