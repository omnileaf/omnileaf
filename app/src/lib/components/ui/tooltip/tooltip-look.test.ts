import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import TooltipHarness from "./TooltipHarness.svelte";

interface TooltipLook {
  readonly platform: Platform;
  readonly padding: string;
  readonly hasArrow: boolean;
  readonly edge: string;
  readonly keyFill: string;
}

const LOOKS: readonly TooltipLook[] = [
  {
    platform: "linux",
    padding: "6px 12px",
    hasArrow: true,
    edge: "0px",
    keyFill: "color-mix(in oklch, var(--background) 20%, transparent)",
  },
  {
    platform: "android",
    padding: "6px 12px",
    hasArrow: true,
    edge: "0px",
    keyFill: "color-mix(in oklch, var(--background) 20%, transparent)",
  },
  {
    platform: "ios",
    padding: "6px 12px",
    hasArrow: true,
    edge: "0px",
    keyFill: "color-mix(in oklch, var(--background) 20%, transparent)",
  },
  {
    platform: "macos",
    padding: "3px 7px",
    hasArrow: false,
    edge: "1px",
    keyFill: "var(--muted)",
  },
  {
    platform: "windows",
    padding: "5px 8px",
    hasArrow: false,
    edge: "1px",
    keyFill: "var(--muted)",
  },
];

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws the ${look.platform} tooltip with its own padding, edge, arrow and key chip`, async () => {
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    const screen = await render(TooltipHarness, {
      label: "Rescan",
      keys: ["Del"],
      onclick: () => undefined,
    });
    await userEvent.hover(
      screen.getByRole("button", { name: "Rescan Sample Comics" }),
    );
    const label = page.getByText("Rescan", { exact: true });
    await expect.element(label).toBeVisible();

    const card = label.element().closest<HTMLElement>("[data-tooltip-content]");
    const arrow = card?.querySelector("[data-arrow]");
    const chip = card?.querySelector("kbd");

    expect(card && getComputedStyle(card).padding).toBe(look.padding);
    expect(card && getComputedStyle(card).borderTopWidth).toBe(look.edge);
    expect(
      arrow instanceof Element && arrow.getBoundingClientRect().width > 0,
    ).toBe(look.hasArrow);
    expect(chip && getComputedStyle(chip).backgroundColor).toBe(
      resolvedColour(look.keyFill, "backgroundColor"),
    );
  });
}

test("sets a tooltip's label at the caption size in regular weight", async () => {
  const screen = await render(TooltipHarness, {
    label: "Rescan",
    onclick: () => undefined,
  });
  await userEvent.hover(
    screen.getByRole("button", { name: "Rescan Sample Comics" }),
  );
  const label = page.getByText("Rescan", { exact: true });
  await expect.element(label).toBeVisible();

  const card = label.element().closest("[data-tooltip-content]");
  const style = card && getComputedStyle(card);

  expect(style?.fontSize).toBe("12px");
  expect(style?.fontWeight).toBe("400");
});
