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

/** Matches SegmentedControl.svelte's own iOS native look, so a series' section tabs read as the same segmented control as the rest of the kit. */
const IOS_SEGMENTED_LOOK: TabsLook = {
  list: "flex gap-native-segmented-gap rounded-native-segmented bg-native-segmented-track p-native-segmented-inset",
  trigger:
    "flex flex-auto items-center justify-center gap-sm rounded-native-segment min-block-native-segment px-native-segment-inline text-native-segment leading-native-segment tracking-native-segment not-aria-selected:bg-native-segment-fill not-aria-selected:font-native-segment not-aria-selected:text-native-on-segment aria-selected:rounded-native-segment-selected aria-selected:bg-native-segment-selected aria-selected:font-native-segment-selected aria-selected:text-native-on-segment-selected aria-selected:shadow-native-segment-lift",
};

const MACOS_SEGMENTED_LOOK: TabsLook = {
  list: IOS_SEGMENTED_LOOK.list,
  trigger: `${IOS_SEGMENTED_LOOK.trigger} segment-divider not-aria-selected:hover:bg-native-control-fill-hover`,
};

export const WINDOWS_SELECTOR_BAR_LOOK: TabsLook = {
  list: "flex items-stretch gap-sm py-xs",
  trigger:
    "relative inline-flex items-center gap-sm rounded-native-button border border-transparent px-md pbs-native-tab-block-start pbe-native-tab-block-end text-label font-regular whitespace-nowrap text-native-on-tab transition-control after:absolute after:inset-be-none after:inset-s-1/2 after:-translate-x-1/2 after:rounded-full after:bg-windows-accent after:opacity-0 after:block-windows-indicator after:inline-windows-indicator-length not-disabled:hover:text-native-on-tab-hover not-disabled:active:text-native-on-tab-hover disabled:text-native-on-tab-disabled aria-selected:text-native-on-tab aria-selected:after:opacity-100 focus-visible:focus-ring forced-colors:after:bg-native-on-tab rtl:after:translate-x-1/2",
};

export const TABS_LOOKS = {
  ios: IOS_SEGMENTED_LOOK,
  android: TODAYS_LOOK,
  linux: SHADCN_LOOK,
  macos: MACOS_SEGMENTED_LOOK,
  windows: WINDOWS_SELECTOR_BAR_LOOK,
} satisfies Record<Platform, TabsLook>;

export function tabsLook(platform: Platform): TabsLook {
  return TABS_LOOKS[platform];
}
