import { expect, test } from "vitest";

import nativeColours from "../../../src-tauri/gen/android/app/src/main/res/values/colors.xml?raw";
import themeCss from "../../theme.css?raw";

const HEX = /^#[0-9a-f]{6}$/;

const NATIVE_TO_PALETTE = {
  page_background: "window",
  primary: "primary",
  on_primary: "on-primary",
  on_surface: "on-surface",
  on_surface_muted: "on-surface-muted",
} as const;

function nativeColour(name: string): string | undefined {
  return new RegExp(`<color name="${name}">(#[0-9a-f]{6})</color>`).exec(
    nativeColours,
  )?.[1];
}

function paletteColours(name: string): readonly string[] {
  return [
    ...themeCss.matchAll(
      new RegExp(`--android-palette-${name}: (#[0-9a-f]{6});`, "g"),
    ),
  ].map((match) => match[1] ?? "");
}

test.each(Object.entries(NATIVE_TO_PALETTE))(
  "gives Android's own %s the interface's light and dark palette",
  (native, palette) => {
    const [light, dark] = paletteColours(palette);

    expect([
      nativeColour(`${native}_light`),
      nativeColour(`${native}_dark`),
    ]).toEqual([light, dark]);
  },
);
