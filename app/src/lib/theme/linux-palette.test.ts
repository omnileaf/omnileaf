import { afterEach, expect, test } from "vitest";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

type Theme = "light" | "dark";

const SHADCN_DARK_CONTROL_FILL =
  "color-mix(in oklch, oklch(1 0 0 / 15%) 30%, transparent)";

function colourOn(platform: Platform, theme: Theme, token: string): string {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  return resolvedColour(token, "backgroundColor");
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("gives linux omnileaf green for the primary in both themes", () => {
  const greens = (["light", "dark"] as const).map((theme) => [
    colourOn("linux", theme, "--primary"),
    colourOn("linux", theme, "--ring"),
    colourOn("linux", theme, "--native-color-focus-ring"),
  ]);

  expect(greens).toEqual([
    Array<string>(3).fill("oklch(0.49 0.084 159.2)"),
    Array<string>(3).fill("oklch(0.78 0.101 156.6)"),
  ]);
});

test("draws linux's text and grounds in shadcn's mist greys", () => {
  const mist = (["light", "dark"] as const).map((theme) => [
    colourOn("linux", theme, "--background"),
    colourOn("linux", theme, "--foreground"),
    colourOn("linux", theme, "--muted-foreground"),
    colourOn("linux", theme, "--sidebar"),
  ]);

  expect(mist).toEqual([
    [
      "oklch(1 0 0)",
      "oklch(0.148 0.004 228.8)",
      "oklch(0.485 0.021 213.5)",
      "oklch(0.987 0.002 197.1)",
    ],
    [
      "oklch(0.148 0.004 228.8)",
      "oklch(0.987 0.002 197.1)",
      "oklch(0.723 0.014 214.4)",
      "oklch(0.218 0.008 223.9)",
    ],
  ]);
});

test("draws linux's outlines in the darker mist input grey", () => {
  const edges = (["light", "dark"] as const).map((theme) => [
    colourOn("linux", theme, "--button-outline-edge"),
    colourOn("linux", theme, "--input-group-edge"),
    colourOn("linux", theme, "--switch-off"),
  ]);

  expect(edges).toEqual([
    Array<string>(3).fill("oklch(0.64 0.014 214.4)"),
    Array<string>(3).fill("oklch(0.52 0.014 214.4)"),
  ]);
});

test("draws linux tooltips in the foreground colour, not green", () => {
  const tooltips = (["light", "dark"] as const).map((theme) => [
    colourOn("linux", theme, "--tooltip-surface"),
    colourOn("linux", theme, "--tooltip-foreground"),
    colourOn("linux", theme, "--tooltip-key-ink"),
  ]);

  expect(tooltips).toEqual([
    ["oklch(0.148 0.004 228.8)", "oklch(1 0 0)", "oklch(1 0 0)"],
    [
      "oklch(0.987 0.002 197.1)",
      "oklch(0.148 0.004 228.8)",
      "oklch(0.148 0.004 228.8)",
    ],
  ]);
});

test("fills linux's dark controls as shadcn does", () => {
  const fills = [
    "--input-fill",
    "--button-outline-fill",
    "--select-fill",
    "--checkbox-off",
  ];

  const dark = fills.map((token) => colourOn("linux", "dark", token));
  const light = fills.map((token) => colourOn("linux", "light", token));

  expect({ dark, light }).toEqual({
    dark: Array<string>(4).fill(
      resolvedColour(SHADCN_DARK_CONTROL_FILL, "backgroundColor"),
    ),
    light: [
      "rgba(0, 0, 0, 0)",
      "oklch(1 0 0)",
      "rgba(0, 0, 0, 0)",
      "rgba(0, 0, 0, 0)",
    ],
  });
});

test("leaves macos and windows on the neutral palette", () => {
  const neutrals = (["macos", "windows"] as const).map((platform) => [
    colourOn(platform, "light", "--primary"),
    colourOn(platform, "light", "--foreground"),
    colourOn(platform, "dark", "--input"),
    colourOn(platform, "light", "--tooltip-key-ink"),
  ]);

  expect(neutrals).toEqual([
    [
      "oklch(0.205 0 0)",
      "oklch(0.145 0 0)",
      "oklch(1 0 0 / 0.15)",
      "oklch(0.5 0.005 286)",
    ],
    [
      "oklch(0.205 0 0)",
      "oklch(0.145 0 0)",
      "oklch(1 0 0 / 0.15)",
      "oklch(0.48 0 0)",
    ],
  ]);
});
