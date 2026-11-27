import type { Platform } from "#lib/ipc/bindings.ts";

export interface CoverSkeletonLook {
  readonly tile: string;
  readonly caption: string;
  readonly title: string;
  readonly meta: string;
}

const TODAYS_LOOK: CoverSkeletonLook = {
  tile: "flex flex-col gap-sm",
  caption: "flex flex-col gap-sm",
  title: "block-md",
  meta: "block-sm",
};

const ANDROID_LOOK: CoverSkeletonLook = {
  tile: "flex flex-col gap-cover-caption medium:gap-sm",
  caption: "flex flex-col",
  title: "block-md my-xs",
  meta: "block-sm my-xs medium:mbs-2xs",
};

const COVER_SKELETON_LOOKS = {
  android: ANDROID_LOOK,
  ios: TODAYS_LOOK,
  linux: {
    tile: TODAYS_LOOK.tile,
    caption: TODAYS_LOOK.caption,
    title: "block-cover-caption-line",
    meta: "block-md",
  },
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, CoverSkeletonLook>;

export function coverSkeletonLook(platform: Platform): CoverSkeletonLook {
  return COVER_SKELETON_LOOKS[platform];
}
