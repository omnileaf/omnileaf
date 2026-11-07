import { afterEach, expect, test } from "vitest";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

type Theme = "light" | "dark";

function colourOn(platform: Platform, theme: Theme, token: string): string {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  return resolvedColour(token, "backgroundColor");
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test("gives android the Material 3 green palette for window background in both themes", () => {
  const windows = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--background"),
  );

  expect(windows).toEqual(["rgb(247, 250, 245)", "rgb(11, 15, 12)"]);
});

test("gives android the Material 3 text colour for foreground in both themes", () => {
  const foregrounds = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--foreground"),
  );

  expect(foregrounds).toEqual(["rgb(44, 53, 46)", "rgb(222, 232, 223)"]);
});

test("gives android the Material 3 primary green in both themes", () => {
  const primaries = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--primary"),
  );

  expect(primaries).toEqual(["rgb(50, 106, 77)", "rgb(120, 217, 159)"]);
});

test("gives android the Material 3 dialog container surface in both themes", () => {
  const surfaces = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--dialog-surface"),
  );

  expect(surfaces).toEqual(["rgb(226, 234, 226)", "rgb(26, 33, 28)"]);
});

test("gives android the Material 3 separator colour for border in both themes", () => {
  const borders = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--border"),
  );

  expect(borders).toEqual(["rgb(171, 180, 172)", "rgb(65, 74, 67)"]);
});

test("gives android the Material 3 outline colour in both themes", () => {
  const outlines = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--control-edge"),
  );

  expect(outlines).toEqual(["rgb(115, 125, 117)", "rgb(110, 120, 112)"]);
});

test("gives android the Material 3 focus ring colour in both themes", () => {
  const rings = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--native-color-focus-ring"),
  );

  expect(rings).toEqual(["rgb(78, 100, 86)", "rgb(180, 204, 187)"]);
});

test("gives android the Material 3 error red for destructive in both themes", () => {
  const errors = (["light", "dark"] as const).map((theme) =>
    colourOn("android", theme, "--destructive"),
  );

  expect(errors).toEqual(["rgb(168, 56, 54)", "rgb(250, 116, 111)"]);
});
