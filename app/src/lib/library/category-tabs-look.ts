import type { ButtonVariant } from "#lib/components/ui/button/looks.ts";
import {
  ITEM_LOOKS,
  ROW_FOCUS_RING,
  ROW_SUBTITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

export interface CategorySheetLook {
  readonly header: string;
  readonly hasBadge: boolean;
  readonly title: string;
  readonly description: string;
  readonly list: string;
  readonly option: string;
  readonly foot: string;
  readonly newVariant: ButtonVariant | undefined;
}

export interface CategoryTabsLook {
  readonly usesMaterialIcons: boolean;
  readonly row: string;
  readonly tab: string;
  readonly chosenTab: string;
  readonly otherTab: string;
  readonly arrow: string;
  readonly sheet: CategorySheetLook;
}

const SHARED_SHEET: CategorySheetLook = {
  header: "flex items-center gap-md px-sheet-inline pbs-sheet-gap",
  hasBadge: true,
  title: "text-title font-bold",
  description: "text-small text-muted",
  list: "flex flex-col overflow-auto pbs-sm min-block-none px-sm",
  option:
    "flex items-center gap-md rounded-control px-md text-start text-body transition-control min-block-touch-target hover:bg-hover active:bg-pressed",
  foot: "flex gap-sm px-sheet-inline pbs-md pbe-sheet-bottom",
  newVariant: undefined,
};

const SHARED_LOOK: CategoryTabsLook = {
  usesMaterialIcons: false,
  row: "-ms-gutter -me-page-end flex items-center gap-xs border-be border-border ps-gutter pe-page-end max-medium:-ms-page-start max-medium:ps-page-start desktop:expanded:ps-xl in-toolbar:ps-lg",
  tab: `relative shrink-0 px-md text-small whitespace-nowrap transition-control min-block-touch-target after:absolute after:inset-x-sm after:inset-be-none after:rounded-full after:block-2xs expanded:min-block-pointer-button touch:touch-target-across ${ROW_FOCUS_RING}`,
  chosenTab: "font-semibold text-foreground after:bg-foreground",
  otherTab: "font-medium text-muted hover:text-foreground",
  arrow:
    "shrink-0 block-touch-target inline-touch-target hover:bg-hover active:bg-pressed",
  sheet: SHARED_SHEET,
};

const SHARED_PHONE_LOOK: CategoryTabsLook = {
  ...SHARED_LOOK,
  sheet: {
    ...SHARED_SHEET,
    list: "flex flex-col overflow-auto pbs-sm min-block-none row-rules",
    option: ITEM_LOOKS.row,
  },
};

const ANDROID_PHONE_LOOK: CategoryTabsLook = {
  usesMaterialIcons: true,
  row: "-ms-page-start -me-page-end flex items-center border-be border-native-tab-rule",
  tab: `relative shrink-0 px-lg text-native-tab-label/native-tab-label font-native-tab-label tracking-native-tab-label whitespace-nowrap transition-control min-inline-native-tab-min min-block-touch-target active:bg-native-row-pressed ${ROW_FOCUS_RING}`,
  chosenTab:
    "text-native-on-tab-current after:absolute after:inset-x-lg after:inset-be-none after:rounded-ss-native-tab-indicator after:rounded-se-native-tab-indicator after:bg-native-tab-indicator after:block-native-tab-indicator",
  otherTab: "text-native-on-tab",
  arrow:
    "mx-xs shrink-0 text-native-on-tab block-touch-target inline-touch-target active:bg-native-row-pressed",
  sheet: {
    header: "flex flex-col px-lg pbe-sm",
    hasBadge: false,
    title:
      "pbe-xs text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title text-balance wrap-anywhere",
    description: `${ROW_SUBTITLE_TYPE} text-muted`,
    list: "flex flex-col overflow-auto pbe-sm min-block-none row-rules",
    option: `${ITEM_LOOKS.row} aria-checked:bg-native-row-current aria-checked:text-native-on-row-current`,
    foot: "grid grid-cols-2 gap-sm px-lg pbs-md pbe-native-sheet-foot-bottom",
    newVariant: "secondary",
  },
};

const PHONE_LOOKS: Partial<Record<Platform, CategoryTabsLook>> = {
  android: ANDROID_PHONE_LOOK,
};

export function categoryTabsLook(
  platform: Platform,
  width: WidthClass,
): CategoryTabsLook {
  if (!isPhone(platform, width)) {
    return SHARED_LOOK;
  }
  return PHONE_LOOKS[platform] ?? SHARED_PHONE_LOOK;
}
