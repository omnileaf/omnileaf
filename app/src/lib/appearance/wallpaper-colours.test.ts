import { afterEach, expect, test } from "vitest";

import type {
  ColourRoles,
  Platform,
  WallpaperColours,
} from "#lib/ipc/bindings.ts";

import {
  followWallpaperColours,
  type ReadWallpaperColours,
} from "./wallpaper-colours";

const root = document.documentElement;
const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos", "windows"];
const LIGHT_PRIMARY = "--android-wallpaper-light-primary";
const DARK_CONTAINER_LOW = "--android-wallpaper-dark-surface-container-low";

function roles(colour: number): ColourRoles {
  return {
    primary: colour,
    onPrimary: colour,
    secondaryContainer: colour,
    onSecondaryContainer: colour,
    tertiaryContainer: colour,
    onTertiaryContainer: colour,
    surface: colour,
    surfaceContainerLow: colour,
    surfaceContainer: colour,
    surfaceContainerHighest: colour,
    onSurface: colour,
    onSurfaceVariant: colour,
    outline: colour,
    outlineVariant: colour,
    inverseSurface: colour,
    inverseOnSurface: colour,
    inversePrimary: colour,
  };
}

const BLUE_WALLPAPER: WallpaperColours = {
  light: { ...roles(0xf9f9fe), primary: 0x416189 },
  dark: { ...roles(0x0c0e12), surfaceContainerLow: 0x111418 },
};

function reading(colours: WallpaperColours | null): ReadWallpaperColours {
  return () => Promise.resolve({ status: "ok", data: colours });
}

const failing: ReadWallpaperColours = () =>
  Promise.resolve({
    status: "error",
    error: { code: "internal", message: "plugin gone" },
  });

function shown(property: string): string {
  return root.style.getPropertyValue(property);
}

afterEach(() => {
  delete root.dataset.colours;
  root.removeAttribute("style");
});

test("draws Android's wallpaper colours in light and dark once they are read", async () => {
  await followWallpaperColours("android", "wallpaper", reading(BLUE_WALLPAPER));

  expect(root.dataset.colours).toBe("wallpaper");
  expect([shown(LIGHT_PRIMARY), shown(DARK_CONTAINER_LOW)]).toEqual([
    "#416189",
    "#111418",
  ]);
});

test("pads a dark colour to six digits", async () => {
  await followWallpaperColours(
    "android",
    "wallpaper",
    reading({ ...BLUE_WALLPAPER, light: roles(0x00000a) }),
  );

  expect(shown(LIGHT_PRIMARY)).toBe("#00000a");
});

test("keeps Omnileaf's colours where Android has none from the wallpaper", async () => {
  await followWallpaperColours("android", "wallpaper", reading(null));

  expect(root.dataset.colours).toBeUndefined();
});

test("keeps Omnileaf's colours when the wallpaper colours can't be read", async () => {
  await followWallpaperColours("android", "wallpaper", failing);

  expect(root.dataset.colours).toBeUndefined();
});

test("goes back to Omnileaf's colours when they are chosen again", async () => {
  await followWallpaperColours("android", "wallpaper", reading(BLUE_WALLPAPER));

  await followWallpaperColours("android", "omnileaf", reading(BLUE_WALLPAPER));

  expect(root.dataset.colours).toBeUndefined();
  expect(shown(LIGHT_PRIMARY)).toBe("");
});

test.each(ELSEWHERE)(
  "never reads wallpaper colours on %s",
  async (platform) => {
    let isRead = false;

    await followWallpaperColours(platform, "wallpaper", () => {
      isRead = true;
      return reading(BLUE_WALLPAPER)();
    });

    expect([isRead, root.dataset.colours]).toEqual([false, undefined]);
  },
);

test("keeps the latest choice when an earlier read finishes after it", async () => {
  const { promise: readFinished, resolve: finishRead } =
    Promise.withResolvers<undefined>();
  const slowRead: ReadWallpaperColours = async () => {
    await readFinished;
    return { status: "ok", data: BLUE_WALLPAPER };
  };
  const following = followWallpaperColours("android", "wallpaper", slowRead);

  await followWallpaperColours("android", "omnileaf", reading(BLUE_WALLPAPER));
  finishRead(undefined);
  await following;

  expect(root.dataset.colours).toBeUndefined();
});
