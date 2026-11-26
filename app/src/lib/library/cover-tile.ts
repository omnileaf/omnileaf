import type { Platform } from "#lib/ipc/bindings.ts";

import { ACCENT_COVER_RING, ACCENT_TITLE } from "./accent-selection-look.ts";

export interface CoverStackLook {
  readonly room: string;
  readonly farSheet: string;
  readonly nearSheet: string;
  readonly continueAt: string;
}

export interface NotConnectedLook {
  readonly dim: string;
  readonly mark: string;
  readonly place: string;
  readonly books: string;
}

export interface CoverTileLook {
  readonly cell: string;
  readonly link: string;
  readonly tags: string;
  readonly hoverCheck: string | undefined;
  readonly hoverCheckBox: string;
  readonly focusRing: string | undefined;
  readonly pickedRing: string;
  readonly menuTargetRing: string;
  readonly pickedTitle: string;
  readonly captionedLink: string;
  readonly title: string;
  readonly compactTitle: string;
  readonly meta: string;
  readonly grid: string;
  readonly stack: CoverStackLook | null;
  readonly cover: string;
  readonly unread: string;
  readonly badge: string;
  readonly downloaded: string;
  readonly downloadedIcon: string;
  readonly mark: string;
  readonly compactMark: string;
  readonly markOn: string;
  readonly markOff: string;
  readonly tick: string;
  readonly notConnected: NotConnectedLook | undefined;
}

const MENU_TARGET_RING = "outline-2 outline-offset-2 outline-border";

export const PICKED_COVER_RING =
  "outline-2 outline-offset-2 outline-foreground";

const NO_PICKED_RING_ON_PHONES = `${PICKED_COVER_RING} max-medium:outline-0`;

const BADGE_PLACEMENT =
  "absolute inset-s-badge-inset inset-bs-badge-inset flex items-center justify-center text-caption medium:inset-s-badge-inset-wide medium:inset-bs-badge-inset-wide large:inset-s-sm large:inset-bs-sm";

const COUNT_BADGE_ON_COVER = `${BADGE_PLACEMENT} ring-1 ring-background forced-colors:outline`;

const BADGE_GEOMETRY = `${COUNT_BADGE_ON_COVER} px-badge-inline min-block-xl min-inline-xl`;

const ANDROID_PICKED_CAPTION =
  "max-medium:in-aria-checked:px-xs max-medium:in-aria-checked:text-native-on-cover-accent";

const ANDROID_TILE_TITLE = `max-medium:text-native-tile-title/native-tile-title! max-medium:font-native-tile-title! max-medium:tracking-native-tile-title! ${ANDROID_PICKED_CAPTION}`;

const ANDROID_COMPACT_TITLE =
  "max-medium:text-native-tab/native-tab max-medium:font-native-tab max-medium:tracking-native-tab";

const ANDROID_GRID = "max-medium:covers-gap-sm! max-medium:covers-row-gap-lg!";

const ANDROID_TILE_META = `max-medium:text-native-tile-meta/native-tile-meta max-medium:font-native-tile-meta max-medium:tracking-native-tile-meta ${ANDROID_PICKED_CAPTION}`;

const NATIVE_COUNT_BADGE = `${BADGE_GEOMETRY} max-medium:rounded-full max-medium:min-block-native-cover-badge max-medium:min-inline-native-cover-badge`;

const ANDROID_COUNT_BADGE = `${NATIVE_COUNT_BADGE} max-medium:inset-s-xs max-medium:inset-bs-xs max-medium:px-xs max-medium:text-native-count-badge/native-count-badge max-medium:tracking-native-count-badge`;

const LINUX_BADGE = `${COUNT_BADGE_ON_COVER} border border-transparent px-sm py-2xs`;

const SHEET =
  "absolute rounded-t-cover border border-b-0 border-cover-edge block-cover-sheet";

const LINUX_STACK: CoverStackLook = {
  room: "pbs-cover-stack-room",
  farSheet: `${SHEET} inset-x-cover-sheet-far inset-bs-none bg-cover-sheet-far`,
  nearSheet: `${SHEET} inset-x-cover-sheet-near inset-bs-cover-sheet-near-top bg-cover-sheet-near`,
  continueAt: "inset-bs-stacked-cover-end",
};

const PHONE_STACK: CoverStackLook = {
  room: "pbs-cover-stack-room-phone",
  farSheet: `${SHEET} inset-x-cover-sheet-far-phone inset-bs-none bg-cover-sheet-far`,
  nearSheet: `${SHEET} inset-x-cover-sheet-near-phone inset-bs-cover-sheet-near-top-phone bg-cover-sheet-near`,
  continueAt: "inset-bs-phone-stacked-cover-end",
};

const TODAYS_LOOK: CoverTileLook = {
  cell: "",
  link: "",
  tags: "",
  hoverCheck: undefined,
  hoverCheckBox: "",
  focusRing: undefined,
  pickedRing: PICKED_COVER_RING,
  menuTargetRing: MENU_TARGET_RING,
  pickedTitle: "",
  captionedLink: "",
  title: "",
  compactTitle: "",
  meta: "",
  grid: "",
  stack: null,
  cover: "",
  unread: BADGE_GEOMETRY,
  badge: "",
  downloaded: "",
  downloadedIcon: "",
  mark: "",
  compactMark: "",
  markOn: "",
  markOff: "",
  tick: "",
  notConnected: undefined,
};

const NATIVE_BADGE =
  "max-medium:rounded-native-cover-badge max-medium:bg-native-cover-badge max-medium:text-native-on-cover-badge";

const NATIVE_SELECT_SIZE =
  "max-medium:rounded-native-select max-medium:block-native-select max-medium:inline-native-select";

const NATIVE_TILE = {
  cell: "",
  link: "",
  tags: "",
  hoverCheck: undefined,
  hoverCheckBox: "",
  focusRing: undefined,
  tick: "",
  pickedRing: PICKED_COVER_RING,
  menuTargetRing: MENU_TARGET_RING,
  pickedTitle: "",
  captionedLink: "",
  title: "",
  compactTitle: "",
  meta: "",
  grid: "",
  stack: null,
  cover: "max-medium:rounded-native-cover",
  mark: "",
  compactMark: "",
  markOn: "",
  markOff: "",
  notConnected: undefined,
};

const ANDROID_COVER = `${NATIVE_TILE.cover} max-medium:border-0`;

const ANDROID_PICKED_COVER = `${NO_PICKED_RING_ON_PHONES} max-medium:scale-92 max-medium:opacity-76`;

const ANDROID_PICKED_TILE =
  "max-medium:relative max-medium:isolate max-medium:aria-checked:before:absolute max-medium:aria-checked:before:inset-none max-medium:aria-checked:before:z-behind max-medium:aria-checked:before:rounded-native-picked-tile max-medium:aria-checked:before:bg-native-cover-accent";

const NATIVE_DOWNLOADED =
  "max-medium:block-native-downloaded-mark max-medium:inline-native-downloaded-mark";

const IOS_BADGE_SHAPE =
  "max-medium:flex max-medium:items-center max-medium:py-none max-medium:min-block-native-cover-badge max-medium:min-inline-native-cover-badge";

const IOS_BADGE = `${NATIVE_BADGE} ${IOS_BADGE_SHAPE} max-medium:backdrop-blur-ios`;

const IOS_TILE_TITLE =
  "max-medium:text-footnote! max-medium:font-native-tile-title!";

const IOS_COUNT_BADGE = `${NATIVE_COUNT_BADGE} max-medium:flex max-medium:items-center max-medium:py-none max-medium:font-native-bar-badge max-medium:tabular-nums`;

const IOS_SELECT_STYLE = `${NATIVE_SELECT_SIZE} max-medium:border-0 max-medium:inset-ring-(length:--native-spacing-select-edge) max-medium:inset-ring-native-select-ring max-medium:shadow-native-shadow-glass max-medium:backdrop-blur-native-glass`;

const IOS_SELECT_CIRCLE = {
  pickedRing: NO_PICKED_RING_ON_PHONES,
  mark: `${IOS_SELECT_STYLE} max-medium:inset-bs-auto max-medium:inset-be-badge-inset max-medium:inset-e-badge-inset`,
  compactMark: IOS_SELECT_STYLE,
  markOn:
    "max-medium:bg-native-cover-accent max-medium:text-native-on-cover-accent",
  markOff: "max-medium:bg-native-scrim",
};

const WINDOWS_TILE_BOX =
  "before:absolute before:z-behind before:-inset-native-tile-lift before:rounded-native-tile before:border-(length:--native-spacing-tile-edge) before:border-transparent before:forced-color-adjust-none before:transition-control";

const WINDOWS_CHECK_BOX =
  "rounded-native-tile-check border block-native-tile-check inline-native-tile-check";

const WINDOWS_MARK = `inset-e-native-tile-mark-inset inset-bs-native-tile-mark-inset ${WINDOWS_CHECK_BOX}`;

const WINDOWS_TILE: CoverTileLook = {
  ...TODAYS_LOOK,
  cell: "group/tile",
  tags: "transition-control group-focus-within/tile:opacity-0 group-hover/tile:opacity-0",
  hoverCheck:
    "inset-e-native-tile-hit-corner inset-bs-native-tile-hit-corner block-native-tile-check-target inline-native-tile-check-target",
  hoverCheckBox: WINDOWS_CHECK_BOX,
  link: `relative isolate ${WINDOWS_TILE_BOX} hover:before:bg-native-tile-hover active:before:bg-native-tile-pressed aria-checked:before:border-native-button-primary`,
  focusRing:
    "focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:outline-offset-1 focus-visible:before:outline-native-focus-ring focus-visible:before:ring-1 focus-visible:before:ring-native-focus-ring-inner",
  pickedRing: "",
  unread: `${COUNT_BADGE_ON_COVER} rounded-full px-xs min-block-native-tile-badge min-inline-native-tile-badge`,
  downloaded: "block-native-tile-badge inline-native-tile-badge",
  mark: WINDOWS_MARK,
  compactMark: WINDOWS_MARK,
  markOn:
    "border-native-button-primary bg-native-button-primary text-native-on-button-primary",
  markOff: "border-native-tile-check-edge bg-native-tile-check-fill",
  tick: "block-native-tile-check-glyph inline-native-tile-check-glyph",
};

const MACOS_TILE: CoverTileLook = {
  ...TODAYS_LOOK,
  stack: LINUX_STACK,
  menuTargetRing: ACCENT_COVER_RING,
  pickedRing:
    "outline-(length:--native-spacing-tile-picked) outline-native-tile-picked outline-offset-0",
  pickedTitle: ACCENT_TITLE,
};

const ANDROID_NOT_CONNECTED: NotConnectedLook = {
  dim: "opacity-38",
  mark: "inline-flex items-center gap-2xs rounded-android-xs bg-card px-xs py-2xs text-caption whitespace-nowrap text-foreground",
  place: "absolute inset-s-xs inset-be-xs max-inline-full",
  books: "",
};

const IOS_NOT_CONNECTED: NotConnectedLook = {
  dim: "opacity-45",
  mark: "inline-flex items-center justify-center gap-2xs rounded-full bg-native-bar-badge px-xs text-caption font-semibold whitespace-nowrap text-foreground shadow-native-shadow-glass backdrop-blur-native-glass min-block-[1.25rem]",
  place: "absolute inset-s-xs inset-be-read-mark-inset max-inline-full",
  books: "text-danger",
};

const MACOS_NOT_CONNECTED: NotConnectedLook = {
  dim: "opacity-45 grayscale",
  mark: "inline-flex items-center justify-center gap-xs rounded-native-button bg-native-button-secondary px-xs text-caption whitespace-nowrap text-native-on-button-secondary min-block-[1.25rem]",
  place: "absolute inset-s-read-mark-inset inset-be-sm max-inline-full",
  books: "text-danger",
};

const LINUX_NOT_CONNECTED: NotConnectedLook = {
  dim: "opacity-45",
  mark: "inline-flex items-center gap-xs rounded-sm bg-background px-badge-inline py-2xs text-caption font-semibold whitespace-nowrap text-foreground",
  place:
    "absolute inset-s-read-mark-inset inset-e-read-mark-inset inset-be-read-mark-inset",
  books: "",
};

const WINDOWS_NOT_CONNECTED: NotConnectedLook = {
  dim: "opacity-45",
  mark: "inline-flex items-center justify-center gap-xs rounded-control border border-border bg-card px-xs text-caption whitespace-nowrap text-foreground min-block-[1.25rem]",
  place: "absolute inset-s-read-mark-inset inset-be-sm max-inline-full",
  books: "text-danger",
};

const COVER_TILE_LOOKS = {
  ios: {
    ...NATIVE_TILE,
    ...IOS_SELECT_CIRCLE,
    title: IOS_TILE_TITLE,
    stack: PHONE_STACK,
    unread: IOS_COUNT_BADGE,
    badge: IOS_BADGE,
    notConnected: IOS_NOT_CONNECTED,
    downloaded: `${NATIVE_BADGE} ${NATIVE_DOWNLOADED} max-medium:backdrop-blur-ios`,
    downloadedIcon: "",
  },
  android: {
    ...NATIVE_TILE,
    cover: ANDROID_COVER,
    link: ANDROID_PICKED_TILE,
    captionedLink: "max-medium:aria-checked:before:-inset-be-xs",
    pickedRing: ANDROID_PICKED_COVER,
    title: ANDROID_TILE_TITLE,
    compactTitle: ANDROID_COMPACT_TITLE,
    stack: PHONE_STACK,
    meta: ANDROID_TILE_META,
    grid: ANDROID_GRID,
    notConnected: ANDROID_NOT_CONNECTED,
    unread: ANDROID_COUNT_BADGE,
    badge: NATIVE_BADGE,
    downloaded: "max-medium:hidden",
    downloadedIcon: "",
  },
  linux: {
    ...TODAYS_LOOK,
    stack: LINUX_STACK,
    unread: LINUX_BADGE,
    notConnected: LINUX_NOT_CONNECTED,
  },
  macos: { ...MACOS_TILE, notConnected: MACOS_NOT_CONNECTED },
  windows: { ...WINDOWS_TILE, notConnected: WINDOWS_NOT_CONNECTED },
} satisfies Record<Platform, CoverTileLook>;

export function coverTileLook(platform: Platform): CoverTileLook {
  return COVER_TILE_LOOKS[platform];
}
