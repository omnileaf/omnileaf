import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

import { ITEM_LOOKS, ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";

export interface CategorySheetLook {
  readonly header: string;
  readonly title: string;
  readonly description: string;
  readonly list: string;
  readonly option: string;
  readonly foot: string;
}

export interface CategoryTabsLook {
  readonly row: string;
  readonly tab: string;
  readonly chosenTab: string;
  readonly otherTab: string;
  readonly arrow: string;
  readonly sheet: CategorySheetLook;
}

const NARROW_WINDOW_SHEET: CategorySheetLook = {
  header: "flex items-center gap-md px-sheet-inline pbs-sheet-gap",
  title: "text-title font-bold",
  description: "text-small text-muted",
  list: "flex flex-col overflow-auto pbs-sm min-block-none px-sm",
  option:
    "flex items-center gap-md rounded-control px-md text-start text-body transition-control min-block-touch-target hover:bg-hover active:bg-pressed",
  foot: "flex gap-sm px-sheet-inline pbs-md pbe-sheet-bottom",
};

const SHARED_LOOK: CategoryTabsLook = {
  row: "-ms-gutter -me-page-end flex items-center gap-xs border-be border-border ps-gutter pe-page-end max-medium:-ms-page-start max-medium:ps-page-start desktop:expanded:ps-xl in-toolbar:ps-lg",
  tab: `relative shrink-0 px-md text-small whitespace-nowrap transition-control min-block-touch-target after:absolute after:inset-x-sm after:inset-be-none after:rounded-full after:block-2xs expanded:min-block-pointer-button touch:touch-target-across ${ROW_FOCUS_RING}`,
  chosenTab: "font-semibold text-foreground after:bg-foreground",
  otherTab: "font-medium text-muted hover:text-foreground",
  arrow:
    "shrink-0 block-touch-target inline-touch-target hover:bg-hover active:bg-pressed",
  sheet: NARROW_WINDOW_SHEET,
};

const SHARED_PHONE_LOOK: CategoryTabsLook = {
  ...SHARED_LOOK,
  sheet: {
    ...NARROW_WINDOW_SHEET,
    list: "flex flex-col overflow-auto pbs-sm min-block-none row-rules",
    option: ITEM_LOOKS.row,
  },
};

export function categoryTabsLook(
  platform: Platform,
  width: WidthClass,
): CategoryTabsLook {
  return isPhone(platform, width) ? SHARED_PHONE_LOOK : SHARED_LOOK;
}
