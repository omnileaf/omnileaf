import type { Platform } from "#lib/ipc/bindings.ts";

export interface TabsLook {
  readonly list: string;
  readonly trigger: string;
}

const TODAYS_LOOK: TabsLook = {
  list: "flex gap-xs rounded-field bg-chip p-xs",
  trigger:
    "flex flex-auto items-center justify-center rounded-control px-sm text-lead font-medium min-block-segment not-aria-selected:text-foreground aria-selected:bg-raised aria-selected:font-semibold aria-selected:shadow-raised",
};

const SHADCN_LOOK: TabsLook = {
  list: "inline-flex w-fit items-center justify-center rounded-field bg-chip p-segment-track text-muted min-block-shadcn-control",
  trigger:
    "room-for-semibold-label inline-flex flex-1 items-center justify-center rounded-small-control border border-transparent px-sm py-xs text-small font-medium whitespace-nowrap transition-control not-aria-selected:text-tab-idle aria-selected:border-tab-chosen-edge aria-selected:text-foreground aria-selected:bg-raised aria-selected:font-semibold aria-selected:shadow-raised focus-visible:focus-ring",
};

export const TABS_LOOKS = {
  ios: TODAYS_LOOK,
  android: TODAYS_LOOK,
  linux: SHADCN_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, TabsLook>;

export function tabsLook(platform: Platform): TabsLook {
  return TABS_LOOKS[platform];
}
