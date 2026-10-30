import { afterEach, expect, test } from "vitest";

import type {
  AccentColours,
  ColourRoles,
  Platform,
  WallpaperColours,
} from "#lib/ipc/bindings.ts";

import {
  type ColourReaders,
  followWallpaperColours,
} from "./wallpaper-colours";
import { BLUE_ACCENT } from "../../../tests/sample-wallpaper";

const root = document.documentElement;
const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos"];
const LIGHT_PRIMARY = "--android-wallpaper-light-primary";
const DARK_CONTAINER_LOW = "--android-wallpaper-dark-surface-container-low";
const LIGHT_ACCENT = "--windows-accent-light";
const DARK_ACCENT = "--windows-accent-dark";

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

const NO_ACCENT: ColourReaders["accentColours"] = () => Promise.resolve(null);

function reading(colours: WallpaperColours | null): ColourReaders {
  return {
    wallpaperColours: () => Promise.resolve({ status: "ok", data: colours }),
    accentColours: NO_ACCENT,
  };
}

const failing: ColourReaders = {
  wallpaperColours: () =>
    Promise.resolve({
      status: "error",
      error: { code: "internal", message: "plugin gone" },
    }),
  accentColours: NO_ACCENT,
};

function accenting(accent: AccentColours | null): ColourReaders {
  return { ...reading(null), accentColours: () => Promise.resolve(accent) };
}

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

test("draws the Windows accent in light and dark once it is read", async () => {
  await followWallpaperColours("windows", "wallpaper", accenting(BLUE_ACCENT));

  expect(root.dataset.colours).toBe("wallpaper");
  expect([shown(LIGHT_ACCENT), shown(DARK_ACCENT)]).toEqual([
    "#0067c0",
    "#4cc2ff",
  ]);
});

test("keeps Omnileaf's colours where Windows has no accent", async () => {
  await followWallpaperColours("windows", "wallpaper", accenting(null));

  expect(root.dataset.colours).toBeUndefined();
});

test("drops the Windows accent when Omnileaf's colours are chosen again", async () => {
  await followWallpaperColours("windows", "wallpaper", accenting(BLUE_ACCENT));

  await followWallpaperColours("windows", "omnileaf", accenting(BLUE_ACCENT));

  expect(root.dataset.colours).toBeUndefined();
  expect(shown(LIGHT_ACCENT)).toBe("");
});

test.each(ELSEWHERE)(
  "never reads the system's colours on %s",
  async (platform) => {
    let isRead = false;
    const counting = () => {
      isRead = true;
    };

    await followWallpaperColours(platform, "wallpaper", {
      wallpaperColours: () => {
        counting();
        return reading(BLUE_WALLPAPER).wallpaperColours();
      },
      accentColours: () => {
        counting();
        return Promise.resolve(BLUE_ACCENT);
      },
    });

    expect([isRead, root.dataset.colours]).toEqual([false, undefined]);
  },
);

test("takes no wallpaper colours on Windows", async () => {
  await followWallpaperColours("windows", "wallpaper", reading(BLUE_WALLPAPER));

  expect([shown(LIGHT_PRIMARY), root.dataset.colours]).toEqual(["", undefined]);
});

test("keeps the latest choice when an earlier read finishes after it", async () => {
  const { promise: readFinished, resolve: finishRead } =
    Promise.withResolvers<undefined>();
  const slowRead: ColourReaders = {
    wallpaperColours: async () => {
      await readFinished;
      return { status: "ok", data: BLUE_WALLPAPER };
    },
    accentColours: NO_ACCENT,
  };
  const following = followWallpaperColours("android", "wallpaper", slowRead);

  await followWallpaperColours("android", "omnileaf", reading(BLUE_WALLPAPER));
  finishRead(undefined);
  await following;

  expect(root.dataset.colours).toBeUndefined();
});
