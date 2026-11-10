import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

export interface SectionTileLook {
  readonly link: string;
  readonly cover: string;
  readonly readMark: string;
  readonly gap: string;
  readonly title: string;
  readonly meta: string;
}

const SHADCN_TILE: SectionTileLook = {
  link: "flex flex-col gap-cover-caption rounded-cover min-inline-none focus-visible:focus-ring",
  cover:
    "relative block aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
  readMark:
    "absolute inset-e-read-mark-inset inset-bs-read-mark-inset flex items-center justify-center rounded-full bg-accent text-on-accent ring-2 ring-background block-native-read-mark inline-native-read-mark",
  gap: "flex aspect-cover items-center justify-center rounded-cover border border-dashed border-muted text-muted",
  title: "truncate text-small font-medium",
  meta: "truncate text-caption text-muted",
};

const SECTION_TILE_LOOKS = {
  linux: SHADCN_TILE,
  macos: SHADCN_TILE,
  windows: SHADCN_TILE,
  ios: SHADCN_TILE,
  android: SHADCN_TILE,
} satisfies Record<Platform, SectionTileLook>;

export function sectionTileLook(platform: Platform): SectionTileLook {
  return SECTION_TILE_LOOKS[platform];
}

const COVERS_FILL_THE_ROW =
  "grid-template-columns: repeat(auto-fill, minmax(calc(var(--spacing-book-cover-min) * var(--text-scale)), 1fr))";
const THREE_COVERS_A_ROW = "grid-template-columns: repeat(3, minmax(0, 1fr))";

export function coversTrack(platform: Platform, width: WidthClass): string {
  return phoneOf(platform, width) === "android"
    ? THREE_COVERS_A_ROW
    : COVERS_FILL_THE_ROW;
}
