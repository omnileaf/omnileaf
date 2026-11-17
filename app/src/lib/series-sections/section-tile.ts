import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

export interface ReadCheck {
  readonly glyph: "lucide" | "platform";
  readonly size: number;
}

export interface SectionTileLook {
  readonly link: string;
  readonly cover: string;
  readonly readMark: string;
  readonly readCheck: ReadCheck;
  readonly gap: string;
  readonly title: string;
  readonly meta: string;
}

const READ_MARK_CIRCLE =
  "absolute flex items-center justify-center rounded-full bg-accent text-on-accent block-native-read-mark inline-native-read-mark";

const SHADCN_TILE: SectionTileLook = {
  link: "flex flex-col gap-cover-caption rounded-cover min-inline-none focus-visible:focus-ring",
  cover:
    "relative block aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
  readMark: `${READ_MARK_CIRCLE} inset-e-read-mark-inset inset-bs-read-mark-inset ring-2 ring-background`,
  readCheck: { glyph: "lucide", size: 14 },
  gap: "flex aspect-cover items-center justify-center rounded-cover border border-dashed border-muted text-muted",
  title: "truncate text-small font-medium",
  meta: "truncate text-caption text-muted",
};

const ANDROID_TILE: SectionTileLook = {
  ...SHADCN_TILE,
  cover:
    "relative block aspect-cover overflow-hidden rounded-native-cover bg-chip",
  readMark: `${READ_MARK_CIRCLE} inset-s-xs inset-bs-xs`,
  readCheck: { glyph: "platform", size: 16 },
  title:
    "truncate text-native-tile-title/native-tile-title font-native-tile-title tracking-native-tile-title",
  meta: "truncate text-native-tile-meta/native-tile-meta font-native-tile-meta tracking-native-tile-meta text-muted",
};

const SECTION_TILE_LOOKS = {
  linux: SHADCN_TILE,
  macos: SHADCN_TILE,
  windows: SHADCN_TILE,
  ios: SHADCN_TILE,
  android: ANDROID_TILE,
} satisfies Record<Platform, SectionTileLook>;

export function sectionTileLook(platform: Platform): SectionTileLook {
  return SECTION_TILE_LOOKS[platform];
}

export interface CoversGrid {
  readonly track: string;
  readonly gap: string;
}

const COVERS_GRID: CoversGrid = {
  track:
    "grid-template-columns: repeat(auto-fill, minmax(calc(var(--spacing-book-cover-min) * var(--text-scale)), 1fr))",
  gap: "gap-x-lg gap-y-cover-row",
};

const ANDROID_PHONE_GRID: CoversGrid = {
  track: "grid-template-columns: repeat(3, minmax(0, 1fr))",
  gap: "gap-x-sm gap-y-lg",
};

export function coversGrid(platform: Platform, width: WidthClass): CoversGrid {
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_GRID
    : COVERS_GRID;
}
