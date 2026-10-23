import type { Platform } from "#lib/ipc/bindings.ts";

export interface CoverTileLook {
  readonly cover: string;
  readonly badge: string;
  readonly downloaded: string;
  readonly downloadedIcon: string;
  readonly mark: string;
  readonly markOn: string;
  readonly markOff: string;
}

const TODAYS_LOOK: CoverTileLook = {
  cover: "",
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

const COVER_TILE_LOOKS = {
  ios: {
    ...NATIVE_TILE,
    badge: `${NATIVE_BADGE} max-medium:flex max-medium:items-center max-medium:py-none max-medium:backdrop-blur-ios max-medium:min-block-native-cover-badge max-medium:min-inline-native-cover-badge`,
    downloaded: `${NATIVE_BADGE} ${NATIVE_DOWNLOADED} max-medium:backdrop-blur-ios`,
    downloadedIcon: "",
  },
  android: {
    ...NATIVE_TILE,
    badge: NATIVE_BADGE,
    downloaded: `${NATIVE_DOWNLOADED} max-medium:bg-native-cover-accent`,
    downloadedIcon: "max-medium:hidden",
  },
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, CoverTileLook>;

export function coverTileLook(platform: Platform): CoverTileLook {
  return COVER_TILE_LOOKS[platform];
}
