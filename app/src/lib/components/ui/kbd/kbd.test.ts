import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { createRawSnippet } from "svelte";

import "../../../../app.css";

import { drawnContrast } from "../../../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import Kbd from "./kbd.svelte";

const KEY_HEIGHT = 20;
const KEY_MIN_WIDTH = 20;

function key(label: string) {
  return createRawSnippet(() => ({ render: () => `<span>${label}</span>` }));
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("sets a key on the muted chip in the secondary text colour, without an edge", async () => {
  document.documentElement.dataset.platform = "macos";
  document.documentElement.dataset.theme = "light";
  await render(Kbd, { children: key("Esc") });

  const chip = page.getByText("Esc").element().closest("kbd");
  const style = chip && getComputedStyle(chip);

  expect(style?.borderTopWidth).toBe("0px");
  expect(style?.backgroundColor).toBe(
    resolvedColour("--muted", "backgroundColor"),
  );
  expect(style?.color).toBe(resolvedColour("--macos-secondary-label", "color"));
  expect(style?.fontWeight).toBe("500");
});

test.each([
  { theme: "light", ink: "rgba(0, 0, 0, 0.62)" },
  { theme: "dark", ink: "rgba(255, 255, 255, 0.773)" },
])(
  "sets a Windows key as plain secondary caption text with no chip in the $theme theme",
  async ({ theme, ink }) => {
    document.documentElement.dataset.platform = "windows";
    document.documentElement.dataset.theme = theme;
    await render(Kbd, { children: key("Esc") });

    const chip = page.getByText("Esc").element().closest("kbd");
    const style = chip && getComputedStyle(chip);

    expect(style?.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style?.padding).toBe("0px");
    expect(style?.color).toBe(ink);
    expect(style?.fontSize).toBe("12px");
    expect(style?.fontWeight).toBe("400");
  },
);

test.each([
  { platform: "macos", theme: "light", ink: "--macos-secondary-label" },
  { platform: "macos", theme: "dark", ink: "--macos-secondary-label" },
  { platform: "linux", theme: "dark", ink: "--muted-foreground" },
])(
  "sets a key in the secondary text colour on $platform in the $theme theme",
  async ({ platform, theme, ink }) => {
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.theme = theme;
    await render(Kbd, { children: key("Esc") });

    const chip = page.getByText("Esc").element().closest("kbd");

    expect(chip && getComputedStyle(chip).color).toBe(
      resolvedColour(ink, "color"),
    );
  },
);

test("keeps a key in the foreground colour on Linux in the light theme, where the secondary text falls short of 4.5:1 on the chip", async () => {
  document.documentElement.dataset.platform = "linux";
  document.documentElement.dataset.theme = "light";
  await render(Kbd, { children: key("Esc") });

  const chip = page.getByText("Esc").element().closest("kbd");

  expect(chip && getComputedStyle(chip).color).toBe(
    resolvedColour("--foreground", "color"),
  );
});

test("draws a single key as a 20px square at least", async () => {
  await render(Kbd, { children: key("K") });

  const chip = page.getByText("K").element().closest("kbd");
  const box = chip?.getBoundingClientRect();

  expect(box?.height).toBeCloseTo(KEY_HEIGHT, 0);
  expect(box?.width).toBeGreaterThanOrEqual(KEY_MIN_WIDTH);
});

const AA_TEXT = 4.5;

test.each(["light", "dark"])(
  "keeps a caller's own fill and ink on a Windows key in the %s theme, so a hint on the accent stays readable",
  async (theme) => {
    document.documentElement.dataset.platform = "windows";
    document.documentElement.dataset.theme = theme;
    await render(Kbd, {
      class: "bg-on-accent text-accent",
      children: key("N"),
    });

    const chip = page.getByText("N").element().closest("kbd");
    if (chip === null) {
      throw new Error("the key drew no kbd");
    }

    expect(getComputedStyle(chip).backgroundColor).toBe(
      resolvedColour("--color-on-accent", "backgroundColor"),
    );
    expect(drawnContrast(chip)).toBeGreaterThanOrEqual(AA_TEXT);
  },
);
