import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { COVERS_PER_ROW } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import CoversPerRowStepper from "./CoversPerRowStepper.svelte";

type Theme = "light" | "dark";

interface KitStepperColours {
  readonly icon: string;
  readonly layer: string;
  readonly focusRing: string;
  readonly disabledFill: string;
  readonly disabledIcon: string;
}

const KIT: Record<Theme, KitStepperColours> = {
  light: {
    icon: "rgb(65, 87, 73)",
    layer: "rgba(65, 87, 73, 0.1)",
    focusRing: "rgb(78, 100, 86)",
    disabledFill: "rgba(44, 53, 46, 0.1)",
    disabledIcon: "rgba(44, 53, 46, 0.38)",
  },
  dark: {
    icon: "rgb(173, 197, 180)",
    layer: "rgba(173, 197, 180, 0.1)",
    focusRing: "rgb(180, 204, 187)",
    disabledFill: "rgba(222, 232, 223, 0.1)",
    disabledIcon: "rgba(222, 232, 223, 0.38)",
  },
};

const THEMES: readonly Theme[] = ["light", "dark"];
const PHONE = { width: 412, height: 915 };
const KIT_STEPPER = { width: 128, height: 40 };
const KIT_COUNT_WIDTH = 32;

async function renderStepper(theme: Theme): Promise<void> {
  await page.viewport(PHONE.width, PHONE.height);
  followCorePlatform("android");
  document.documentElement.dataset.theme = theme;
  await render(CoversPerRowStepper, {
    size: "phone",
    count: COVERS_PER_ROW.phone.fewest,
    drawn: undefined,
    mostThatFit: undefined,
    onCount: () => undefined,
  });
}

function element(name: string): HTMLElement {
  const found = page.getByRole("button", { name }).element();
  if (!(found instanceof HTMLElement)) {
    throw new Error(`the ${name} button drew no element`);
  }
  return found;
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

test("draws Android's stepper 128 by 40, with a 32px count between the buttons", async () => {
  await renderStepper("light");

  const group = page
    .getByRole("group", { name: "Covers per row, chosen" })
    .element()
    .getBoundingClientRect();
  const count = page.getByRole("status");

  expect(group.width).toBe(KIT_STEPPER.width);
  expect(group.height).toBe(KIT_STEPPER.height);
  expect(count.element().getBoundingClientRect().width).toBe(KIT_COUNT_WIDTH);
});

for (const theme of THEMES) {
  const kit = KIT[theme];

  test(`draws Android's stepper signs in the tonal label colour in the ${theme} theme`, async () => {
    await renderStepper(theme);

    expect(getComputedStyle(element("More covers per row")).color).toBe(
      kit.icon,
    );
  });

  test(`greys Android's stepper button at its limit the kit's way in the ${theme} theme`, async () => {
    await renderStepper(theme);

    const fewer = getComputedStyle(element("Fewer covers per row"));

    expect(fewer.backgroundColor).toBe(kit.disabledFill);
    expect(fewer.color).toBe(kit.disabledIcon);
    expect(fewer.opacity).toBe("1");
  });

  test(`rings a focused Android stepper button 3px out by 2px over a state layer in the ${theme} theme`, async () => {
    await renderStepper(theme);

    await userEvent.tab();
    const more = element("More covers per row");
    await expect.element(more).toHaveFocus();
    const style = getComputedStyle(more);

    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("3px");
    expect(style.outlineOffset).toBe("2px");
    expect(style.outlineColor).toBe(kit.focusRing);
    expect(style.backgroundImage).toBe(
      `linear-gradient(${kit.layer}, ${kit.layer})`,
    );
  });
}

test("rounds Android's stepper buttons to half their height at rest", async () => {
  await renderStepper("light");

  const more = element("More covers per row");

  expect(getComputedStyle(more).borderTopLeftRadius).toBe(
    `${String(more.getBoundingClientRect().height / 2)}px`,
  );
});
