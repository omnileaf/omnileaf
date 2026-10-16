import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import ToggleGroupHarness from "./ToggleGroupHarness.svelte";

interface SegmentLook {
  readonly platform: Platform;
  readonly height: number;
  readonly innerCorner: string;
  readonly outerCorner: string;
  readonly chosenFill: string;
  readonly otherFill: string;
}

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;

const LOOKS: readonly SegmentLook[] = [
  {
    platform: "linux",
    height: 36,
    innerCorner: "0px",
    outerCorner: "8px",
    chosenFill: "--accent",
    otherFill: "--background",
  },
  {
    platform: "macos",
    height: 28,
    innerCorner: "6px",
    outerCorner: "6px",
    chosenFill: "--accent",
    otherFill: "--background",
  },
  {
    platform: "windows",
    height: 32,
    innerCorner: "4px",
    outerCorner: "4px",
    chosenFill: "--primary",
    otherFill: "--windows-control",
  },
];

function resolved(
  token: string,
  property: "color" | "backgroundColor",
): string {
  const probe = document.createElement("span");
  probe.style[property] = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe)[property];
  probe.remove();
  return colour;
}

function colourOf(token: string): string {
  return resolved(token, "backgroundColor");
}

function inkOf(token: string): string {
  return resolved(token, "color");
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const look of LOOKS) {
  test(`draws the ${look.platform} segments at their own height, corners and fills`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(ToggleGroupHarness);

    const chosen = page.getByRole("radio", { name: "Grid" }).element();
    const middle = page.getByRole("radio", { name: "Compact" }).element();

    expect(middle.getBoundingClientRect().height).toBeCloseTo(look.height, 0);
    expect(getComputedStyle(middle).borderTopLeftRadius).toBe(look.innerCorner);
    expect(getComputedStyle(chosen).backgroundColor).toBe(
      colourOf(look.chosenFill),
    );
    expect(getComputedStyle(middle).backgroundColor).toBe(
      colourOf(look.otherFill),
    );
  });
}

for (const look of LOOKS) {
  test(`rounds the outer corners of the ${look.platform} segments to ${look.outerCorner}`, async () => {
    await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
    document.documentElement.dataset.platform = look.platform;
    document.documentElement.dataset.theme = "light";
    await render(ToggleGroupHarness);

    const first = page.getByRole("radio", { name: "Grid" }).element();
    const last = page.getByRole("radio", { name: "List" }).element();

    expect(getComputedStyle(first).borderTopLeftRadius).toBe(look.outerCorner);
    expect(getComputedStyle(last).borderBottomRightRadius).toBe(
      look.outerCorner,
    );
  });
}

test("writes the chosen Windows segment in the colour on the accent", async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  await render(ToggleGroupHarness);

  const chosen = page.getByRole("radio", { name: "Grid" }).element();

  expect(getComputedStyle(chosen).color).toBe(inkOf("--primary-foreground"));
});
