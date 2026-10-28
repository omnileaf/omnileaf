import type { Platform } from "#lib/ipc/bindings.ts";

export interface EmptyLook {
  readonly title: string;
  readonly prose: string;
}

const TODAYS_LOOK: EmptyLook = {
  title: "text-group-title",
  prose: "max-inline-prose",
};

const EMPTY_LOOKS = {
  android: TODAYS_LOOK,
  ios: TODAYS_LOOK,
  linux: {
    title: "text-empty-title",
    prose: "max-inline-empty leading-relaxed",
  },
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, EmptyLook>;

export function emptyLook(platform: Platform): EmptyLook {
  return EMPTY_LOOKS[platform];
}
