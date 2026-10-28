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

test("gives windows the kit's green for the primary in both themes", () => {
  const primaries = (["light", "dark"] as const).map((theme) =>
    colourOn("windows", theme, "--primary"),
  );

  expect(primaries).toEqual(["rgb(47, 111, 79)", "rgb(127, 203, 157)"]);
});

test("leaves the primary on the other platforms as it was", () => {
  const linux = colourOn("linux", "light", "--primary");
  const macos = colourOn("macos", "light", "--primary");

  expect([linux, macos]).not.toContain("rgb(47, 111, 79)");
});
