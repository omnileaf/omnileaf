import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";

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

export function searchLook(isNative: boolean): SearchLook {
  return isNative ? NATIVE_SEARCH_LOOK : TODAYS_SEARCH_LOOK;
}
