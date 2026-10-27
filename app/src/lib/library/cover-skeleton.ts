import type { Platform } from "#lib/ipc/bindings.ts";

export interface CoverSkeletonLook {
  readonly title: string;
  readonly meta: string;
}

const TODAYS_LOOK: CoverSkeletonLook = {
  title: "block-md",
  meta: "block-sm",
};

const COVER_SKELETON_LOOKS = {
  android: TODAYS_LOOK,
  ios: TODAYS_LOOK,
  linux: {
    title: "block-cover-caption-line",
    meta: "block-md",
  },
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, CoverSkeletonLook>;

export function coverSkeletonLook(platform: Platform): CoverSkeletonLook {
  return COVER_SKELETON_LOOKS[platform];
}
