import type { Platform } from "#lib/ipc/bindings.ts";

export interface SeriesBandLook {
  readonly band: string;
  readonly picture: string;
  readonly fade: string;
}

const NO_LOOK: SeriesBandLook = { band: "", picture: "", fade: "" };

const ANDROID_PHONE_BAND =
  "max-medium:block-native-series-band max-medium:series-band-fade-down";

const ANDROID_LOOK: SeriesBandLook = {
  band: ANDROID_PHONE_BAND,
  picture: "max-medium:opacity-30",
  fade: "max-medium:hidden",
};

const SERIES_BAND_LOOKS = {
  android: ANDROID_LOOK,
  ios: NO_LOOK,
  linux: NO_LOOK,
  macos: NO_LOOK,
  windows: NO_LOOK,
} satisfies Record<Platform, SeriesBandLook>;

export function seriesBandLook(platform: Platform): SeriesBandLook {
  return SERIES_BAND_LOOKS[platform];
}
