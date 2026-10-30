import {
  type AccentColours,
  type ColourRoles,
  commands,
  type Platform,
  type WallpaperColours,
} from "#lib/ipc/bindings.ts";

import type { ColoursChoice } from "./colours.svelte";

export type ColourReaders = Pick<
  typeof commands,
  "wallpaperColours" | "accentColours"
>;

type Theme = keyof WallpaperColours;

const THEMES: readonly Theme[] = ["light", "dark"];

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

type SystemColours = ReadonlyMap<string, string>;

type ReadSystemColours = (
  readers: ColourReaders,
) => Promise<SystemColours | null>;

let latestRequest = 0;

const HEX_DIGITS = 6;
const HEX = 16;

function wallpaperPropertyOf(theme: Theme, role: keyof ColourRoles): string {
  return `--android-wallpaper-${theme}-${ROLE_NAMES[role]}`;
}

function accentPropertyOf(theme: Theme): string {
  return `--windows-accent-${theme}`;
}

const SYSTEM_PROPERTIES = THEMES.flatMap((theme) => [
  ...ROLES.map((role) => wallpaperPropertyOf(theme, role)),
  accentPropertyOf(theme),
]);

function hexOf(rgb: number): string {
  return `#${rgb.toString(HEX).padStart(HEX_DIGITS, "0")}`;
}

function wallpaperProperties(colours: WallpaperColours): SystemColours {
  return new Map(
    THEMES.flatMap((theme) =>
      ROLES.map((role) => [
        wallpaperPropertyOf(theme, role),
        hexOf(colours[theme][role]),
      ]),
    ),
  );
}

function accentProperties(accent: AccentColours): SystemColours {
  return new Map(
    THEMES.map((theme) => [accentPropertyOf(theme), hexOf(accent[theme])]),
  );
}

async function readWallpaper(
  readers: ColourReaders,
): Promise<SystemColours | null> {
  const result = await readers.wallpaperColours();
  return result.status === "error" || result.data === null
    ? null
    : wallpaperProperties(result.data);
}

async function readAccent(
  readers: ColourReaders,
): Promise<SystemColours | null> {
  const accent = await readers.accentColours();
  return accent === null ? null : accentProperties(accent);
}

const SYSTEM_COLOURS = {
  android: readWallpaper,
  ios: null,
  linux: null,
  macos: null,
  windows: readAccent,
} satisfies Record<Platform, ReadSystemColours | null>;

function showOmnileafColours(root: HTMLElement): void {
  delete root.dataset.colours;
  for (const property of SYSTEM_PROPERTIES) {
    root.style.removeProperty(property);
  }
}

function showSystemColours(root: HTMLElement, colours: SystemColours): void {
  for (const [property, value] of colours) {
    root.style.setProperty(property, value);
  }
  root.dataset.colours = "wallpaper";
}

export async function followWallpaperColours(
  platform: Platform,
  choice: ColoursChoice,
  readers: ColourReaders = commands,
): Promise<void> {
  const root = document.documentElement;
  latestRequest += 1;
  const request = latestRequest;
  const read = SYSTEM_COLOURS[platform];
  if (choice === "omnileaf" || read === null) {
    showOmnileafColours(root);
    return;
  }
  const colours = await read(readers);
  if (request !== latestRequest) {
    return;
  }
  if (colours === null) {
    showOmnileafColours(root);
    return;
  }
  showSystemColours(root, colours);
}
