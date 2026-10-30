import {
  ITEM_LOOKS,
  ROW_FOCUS_RING,
  ROW_SUBTITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import {
  GROUPED_FOOTNOTE_TYPE,
  GROUPED_GROUP_LOOK,
} from "#lib/library/group-look.ts";
import { FILTER_SETTING_LABEL_TYPE } from "#lib/library/filter-sheet-look.ts";
import { GROUP_PLATE } from "#lib/page/plates.ts";

export interface SearchLook {
  readonly heading: string;
  readonly title: string;
  readonly line: string;
}

export const TODAYS_SEARCH_LOOK: SearchLook = {
  heading: "font-semibold",
  title: "truncate text-lead font-semibold large:text-small",
  line: "text-caption text-muted",
};

export const NATIVE_SEARCH_LOOK: SearchLook = {
  heading:
    "text-native-row-title/native-row-title tracking-native-row-title font-native-group-header text-muted",
  title:
    "truncate text-native-row-title/native-row-title font-native-row-title tracking-native-row-title",
  line: `${ROW_SUBTITLE_TYPE} text-muted`,
};

export const ANDROID_SEARCH_LOOK: SearchLook = {
  ...NATIVE_SEARCH_LOOK,
  heading: `pbs-md pbe-sm text-native-on-button-plain ${FILTER_SETTING_LABEL_TYPE}`,
};

export function searchLook(phone: "ios" | "android" | undefined): SearchLook {
  if (phone === "android") {
    return ANDROID_SEARCH_LOOK;
  }
  return phone === "ios" ? NATIVE_SEARCH_LOOK : TODAYS_SEARCH_LOOK;
}

export interface StartLook {
  readonly body: string;
  readonly section: string;
  readonly head: string;
  readonly heading: string;
  readonly headingBesideAction: string;
  readonly clear: { readonly look: "text" } | { readonly variant: "plain" };
  readonly rows: string;
  readonly row: string;
  readonly staticRow: string;
  readonly lead: string;
  readonly iconSize: number;
  readonly filterSection: string;
  readonly example: string;
  readonly filters: string;
}

const TODAYS_ROW = "flex items-center gap-md py-md";

export const TODAYS_START_LOOK: StartLook = {
  body: "flex flex-col gap-section-gap pbs-md large:gap-xl",
  section: "flex flex-col gap-xs",
  head: "flex items-center justify-between gap-sm",
  heading: TODAYS_SEARCH_LOOK.heading,
  headingBesideAction: TODAYS_SEARCH_LOOK.heading,
  clear: { look: "text" },
  rows: "flex flex-col divide-y divide-border",
  row: `${TODAYS_ROW} rounded-control text-start transition-control inline-full hover:tint-hover active:tint-pressed`,
  staticRow: TODAYS_ROW,
  lead: "flex shrink-0 text-muted",
  iconSize: 16,
  filterSection: "flex flex-col gap-sm",
  example: "text-detail text-muted",
  filters: "flex flex-wrap gap-sm",
};

export const NATIVE_START_LOOK: StartLook = {
  body: "flex flex-col gap-md pbs-md",
  section: "flex flex-col",
  head: "flex items-center justify-between gap-sm ps-lg pe-native-group-head-end mbe-native-group-head-below min-block-native-button",
  heading: GROUPED_GROUP_LOOK.heading,
  headingBesideAction: NATIVE_SEARCH_LOOK.heading,
  clear: { variant: "plain" },
  rows: `row-rules overflow-hidden ${GROUP_PLATE}`,
  row: `${ITEM_LOOKS.row} ${ROW_FOCUS_RING}`,
  staticRow: ITEM_LOOKS["row-static"],
  lead: "flex shrink-0 items-center justify-center text-muted inline-native-row-lead",
  iconSize: 20,
  filterSection: "flex flex-col",
  example: `px-lg mbe-sm ${GROUPED_FOOTNOTE_TYPE}`,
  filters: "flex flex-wrap gap-sm px-lg",
};

export function startLook(isNative: boolean): StartLook {
  return isNative ? NATIVE_START_LOOK : TODAYS_START_LOOK;
}

export type FilterPlace = "token" | "field" | "row";
