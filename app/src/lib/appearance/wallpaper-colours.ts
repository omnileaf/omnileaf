import {
  type ColourRoles,
  commands,
  type Platform,
  type WallpaperColours,
} from "#lib/ipc/bindings.ts";

import type { ColoursChoice } from "./colours.svelte";

export type ReadWallpaperColours = typeof commands.wallpaperColours;

type Theme = keyof WallpaperColours;

const THEMES: readonly Theme[] = ["light", "dark"];

const HAS_WALLPAPER_COLOURS = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

const ROLE_NAMES = {
  primary: "primary",
  onPrimary: "on-primary",
  secondaryContainer: "secondary-container",
  onSecondaryContainer: "on-secondary-container",
  tertiaryContainer: "tertiary-container",
  onTertiaryContainer: "on-tertiary-container",
  surface: "surface",
  surfaceContainerLow: "surface-container-low",
  surfaceContainer: "surface-container",
  surfaceContainerHighest: "surface-container-highest",
  onSurface: "on-surface",
  onSurfaceVariant: "on-surface-variant",
  outline: "outline",
  outlineVariant: "outline-variant",
  inverseSurface: "inverse-surface",
  inverseOnSurface: "inverse-on-surface",
  inversePrimary: "inverse-primary",
} satisfies Record<keyof ColourRoles, string>;

const ROLES = Object.keys(ROLE_NAMES).filter(
  (role): role is keyof ColourRoles => role in ROLE_NAMES,
);

let latestRequest = 0;

const HEX_DIGITS = 6;
const HEX = 16;

function propertyOf(theme: Theme, role: keyof ColourRoles): string {
  return `--android-wallpaper-${theme}-${ROLE_NAMES[role]}`;
}

function hexOf(rgb: number): string {
  return `#${rgb.toString(HEX).padStart(HEX_DIGITS, "0")}`;
}

function showOmnileafColours(root: HTMLElement): void {
  delete root.dataset.colours;
  for (const theme of THEMES) {
    for (const role of ROLES) {
      root.style.removeProperty(propertyOf(theme, role));
    }
  }
}

function showWallpaperColours(
  root: HTMLElement,
  colours: WallpaperColours,
): void {
  for (const theme of THEMES) {
    for (const role of ROLES) {
      root.style.setProperty(
        propertyOf(theme, role),
        hexOf(colours[theme][role]),
      );
    }
  }
  root.dataset.colours = "wallpaper";
}

export async function followWallpaperColours(
  platform: Platform,
  choice: ColoursChoice,
  read: ReadWallpaperColours = commands.wallpaperColours,
): Promise<void> {
  const root = document.documentElement;
  latestRequest += 1;
  const request = latestRequest;
  if (choice === "omnileaf" || !HAS_WALLPAPER_COLOURS[platform]) {
    showOmnileafColours(root);
    return;
  }
  const result = await read();
  if (request !== latestRequest) {
    return;
  }
  if (result.status === "error" || result.data === null) {
    showOmnileafColours(root);
    return;
  }
  showWallpaperColours(root, result.data);
}
