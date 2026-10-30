import type {
  AccentColours,
  WallpaperColours,
} from "../src/lib/ipc/bindings.ts";

export const BLUE_WALLPAPER: WallpaperColours = {
  light: {
    primary: 0x416189,
    onPrimary: 0xf8f8ff,
    secondaryContainer: 0xd8e3f8,
    onSecondaryContainer: 0x475263,
    tertiaryContainer: 0xdacdff,
    onTertiaryContainer: 0x4d436c,
    surface: 0xf9f9fe,
    surfaceContainerLow: 0xf2f3fa,
    surfaceContainer: 0xeceef5,
    surfaceContainerHighest: 0xdfe2ec,
    onSurface: 0x2e333a,
    onSurfaceVariant: 0x5b5f67,
    outline: 0x777b83,
    outlineVariant: 0xaeb2bb,
    inverseSurface: 0x0c0e12,
    inverseOnSurface: 0x9c9da1,
    inversePrimary: 0xafcefd,
  },
  dark: {
    primary: 0xb1c8ec,
    onPrimary: 0x2a415f,
    secondaryContainer: 0x313c4c,
    onSecondaryContainer: 0xb4c0d4,
    tertiaryContainer: 0xdacdff,
    onTertiaryContainer: 0x4d436c,
    surface: 0x0c0e12,
    surfaceContainerLow: 0x111418,
    surfaceContainer: 0x161a1f,
    surfaceContainerHighest: 0x22262d,
    onSurface: 0xe2e5ef,
    onSurfaceVariant: 0xa7abb4,
    outline: 0x71767e,
    outlineVariant: 0x444850,
    inverseSurface: 0xf9f9fe,
    inverseOnSurface: 0x535559,
    inversePrimary: 0x4a6080,
  },
};

export const BLUE_ACCENT: AccentColours = {
  light: 0x0067c0,
  dark: 0x4cc2ff,
  lightText: 0x003e92,
  darkText: 0x99ebff,
};
