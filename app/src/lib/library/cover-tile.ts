import type { Platform } from "#lib/ipc/bindings.ts";

export interface CoverTileLook {
  readonly cover: string;
  readonly unread: string;
  readonly badge: string;
  readonly downloaded: string;
  readonly downloadedIcon: string;
  readonly mark: string;
  readonly markOn: string;
  readonly markOff: string;
}

const BADGE_PLACEMENT =
  "absolute inset-s-badge-inset inset-bs-badge-inset flex items-center justify-center text-caption medium:inset-s-badge-inset-wide medium:inset-bs-badge-inset-wide large:inset-s-sm large:inset-bs-sm";

const BADGE_GEOMETRY = `${BADGE_PLACEMENT} px-badge-inline min-block-xl min-inline-xl`;

const LINUX_BADGE = `${BADGE_PLACEMENT} border border-transparent px-sm py-2xs`;

const TODAYS_LOOK: CoverTileLook = {
  cover: "",
  unread: BADGE_GEOMETRY,
  badge: "",
  downloaded: "",
  downloadedIcon: "",
  mark: "",
  markOn: "",
  markOff: "",
};

const NATIVE_BADGE =
  "max-medium:rounded-native-cover-badge max-medium:bg-native-cover-badge max-medium:text-native-on-cover-badge";

const NATIVE_TILE = {
  cover: "max-medium:rounded-native-cover",
  mark: "max-medium:rounded-native-select max-medium:border-(length:--native-spacing-select-edge) max-medium:block-native-select max-medium:inline-native-select",
  markOn:
    "max-medium:border-native-cover-accent max-medium:bg-native-cover-accent max-medium:text-native-on-cover-accent",
  markOff:
    "max-medium:border-native-select-ring max-medium:bg-transparent max-medium:shadow-native-select-ring-lift",
};

const NATIVE_DOWNLOADED =
  "max-medium:block-native-downloaded-mark max-medium:inline-native-downloaded-mark";

const IOS_BADGE = `${NATIVE_BADGE} max-medium:flex max-medium:items-center max-medium:py-none max-medium:backdrop-blur-ios max-medium:min-block-native-cover-badge max-medium:min-inline-native-cover-badge`;

const COVER_TILE_LOOKS = {
  ios: {
    ...NATIVE_TILE,
    unread: `${BADGE_GEOMETRY} ${IOS_BADGE}`,
    badge: IOS_BADGE,
    downloaded: `${NATIVE_BADGE} ${NATIVE_DOWNLOADED} max-medium:backdrop-blur-ios`,
    downloadedIcon: "",
  },
  android: {
    ...NATIVE_TILE,
    unread: `${BADGE_GEOMETRY} ${NATIVE_BADGE}`,
    badge: NATIVE_BADGE,
    downloaded: `${NATIVE_DOWNLOADED} max-medium:bg-native-cover-accent`,
    downloadedIcon: "max-medium:hidden",
  },
  linux: { ...TODAYS_LOOK, unread: LINUX_BADGE },
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, CoverTileLook>;

export function coverTileLook(platform: Platform): CoverTileLook {
  return COVER_TILE_LOOKS[platform];
}
