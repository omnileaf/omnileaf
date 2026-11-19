import type { ResolvedPathname } from "$app/types";
import type { ChapterVolume } from "#lib/ipc/bindings.ts";
import type { PhonePlatform } from "#lib/page/platform.ts";

export interface ChapterVolumes {
  readonly counts: readonly ChapterVolume[];
  readonly pageOf: (volume: number) => ResolvedPathname;
}

const FOLDS_CHAPTER_VOLUMES = {
  android: true,
  ios: false,
} as const satisfies Record<PhonePlatform, boolean>;

export function foldsChapterVolumes(phone: PhonePlatform | undefined): boolean {
  return phone !== undefined && FOLDS_CHAPTER_VOLUMES[phone];
}
