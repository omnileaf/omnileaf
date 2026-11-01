import {
  ITEM_LOOKS,
  ROW_FOCUS_RING,
  ROW_SUBTITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import {
  ACCENT_COVER_RING,
  ACCENT_TITLE,
} from "#lib/library/accent-selection-look.ts";
import {
  GROUPED_FOOTNOTE_TYPE,
  GROUPED_GROUP_LOOK,
} from "#lib/library/group-look.ts";
import { FILTER_SETTING_LABEL_TYPE } from "#lib/library/filter-sheet-look.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { GROUP_PLATE } from "#lib/page/plates.ts";

export interface SearchLook {
  readonly heading: string;
  readonly title: string;
  readonly line: string;
  readonly mark: string;
  readonly selectsOnClick: boolean;
  readonly section: string;
  readonly grid: string;
  readonly coversFit: string;
  readonly coversPerRow: string;
  readonly cover: string;
  readonly result: string;
  readonly selectedCover: string;
  readonly selectedTitle: string;
}

const TODAYS_MARK = "rounded-badge bg-chip text-foreground";
const NATIVE_MARK = "rounded-none bg-native-accent-soft text-inherit";
const ANDROID_MARK = "rounded-none bg-transparent font-medium text-inherit";

export const TODAYS_SEARCH_LOOK: SearchLook = {
  heading: "font-semibold",
  title: "truncate text-lead font-semibold large:text-small",
  line: "text-caption text-muted",
  mark: TODAYS_MARK,
  selectsOnClick: false,
  section: "flex flex-col gap-sm large:gap-label",
  grid: "grid-cols-1 gap-sm large:covers-gap-xl large:covers-row-gap-cover-row-wide",
  coversFit: "large:grid-cols-covers-fit",
  coversPerRow: "large:grid-cols-covers-per-row",
  cover:
    "rounded-result-cover inline-result-cover large:box-border large:rounded-cover large:inline-full",
  result:
    "flex cursor-default items-center gap-md rounded-card min-inline-none aria-selected:bg-accent-soft large:flex-col large:items-stretch large:gap-sm large:rounded-cover large:aria-selected:bg-transparent large:aria-selected:outline-2 large:aria-selected:outline-offset-4 large:aria-selected:outline-accent",
  selectedCover: "",
  selectedTitle: "",
};

export const NATIVE_SEARCH_LOOK: SearchLook = {
  ...TODAYS_SEARCH_LOOK,
  mark: NATIVE_MARK,
  heading:
    "text-native-row-title/native-row-title tracking-native-row-title font-native-group-header text-muted",
  title:
    "truncate text-native-row-title/native-row-title font-native-row-title tracking-native-row-title",
  line: `${ROW_SUBTITLE_TYPE} text-muted`,
};

export const ANDROID_SEARCH_LOOK: SearchLook = {
  ...NATIVE_SEARCH_LOOK,
  mark: ANDROID_MARK,
  heading: `pbs-md pbe-sm text-native-on-button-plain ${FILTER_SETTING_LABEL_TYPE}`,
};

export const MACOS_SEARCH_LOOK: SearchLook = {
  ...TODAYS_SEARCH_LOOK,
  heading:
    "text-native-title-bar-title/native-title-bar-title font-native-title-bar-title tracking-native-title-bar-title",
  title:
    "line-clamp-2 text-native-button/native-button font-native-button tracking-native-search-title",
  line: "text-native-sheet-text/native-sheet-text tracking-native-sheet-text text-muted",
  mark: "rounded-native-search-hit bg-warning-soft text-on-warning",
  selectsOnClick: true,
  section: "flex flex-col gap-sm",
  grid: "covers-gap-cover-row covers-row-gap-xl",
  coversFit: "grid-cols-4 large:grid-cols-covers-fit",
  coversPerRow: "grid-cols-4 large:grid-cols-covers-per-row",
  cover: "box-border rounded-cover inline-full",
  result:
    "flex cursor-default select-none flex-col items-stretch gap-sm min-inline-none",
  selectedCover: ACCENT_COVER_RING,
  selectedTitle: ACCENT_TITLE,
};

export function searchLook(
  platform: Platform,
  phone: "ios" | "android" | undefined,
): SearchLook {
  if (platform === "macos") {
    return MACOS_SEARCH_LOOK;
  }
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

export const ANDROID_START_LOOK: StartLook = {
  body: "flex flex-col",
  section: "flex flex-col",
  head: "flex items-center justify-between gap-sm",
  heading: ANDROID_SEARCH_LOOK.heading,
  headingBesideAction: ANDROID_SEARCH_LOOK.heading,
  clear: { variant: "plain" },
  rows: "flex flex-col",
  row: `${ITEM_LOOKS.row} ${ROW_FOCUS_RING}`,
  staticRow: ITEM_LOOKS["row-static"],
  lead: "flex shrink-0 items-center justify-center text-muted",
  iconSize: 24,
  filterSection: "flex flex-col",
  example: `${ROW_SUBTITLE_TYPE} pbe-sm text-muted`,
  filters: "flex flex-wrap gap-sm pbe-sm",
};

export function startLook(isNative: boolean, isMaterial = false): StartLook {
  if (isMaterial) {
    return ANDROID_START_LOOK;
  }
  return isNative ? NATIVE_START_LOOK : TODAYS_START_LOOK;
}

export type FilterPlace = "token" | "field" | "row";
