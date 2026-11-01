import { GROUP_PLATE } from "#lib/page/plates.ts";

export interface GroupLook {
  readonly section: string;
  readonly heading: string;
  readonly group: string;
}

export const PLAIN_GROUP_LOOK: GroupLook = {
  section: "",
  heading: "text-small font-semibold",
  group: "flex flex-col divide-y divide-border",
};

export const GROUPED_HEADING_TYPE =
  "text-native-row-title/native-row-title tracking-native-row-title font-native-group-header text-muted";

export const GROUPED_GROUP_LOOK: GroupLook = {
  section: "px-lg",
  heading: `ps-lg ${GROUPED_HEADING_TYPE} mbe-sm`,
  group: `flex flex-col divide-y divide-border overflow-hidden px-lg ios-grouped:divide-ios-separator ${GROUP_PLATE}`,
};

export const GROUPED_FOOTNOTE_TYPE =
  "text-native-group-footer/native-group-footer tracking-native-group-footer text-muted";

export const GROUPED_FOOTNOTE = `ps-lg ${GROUPED_FOOTNOTE_TYPE} mbs-sm`;

export function groupLook(isGrouped: boolean): GroupLook {
  return isGrouped ? GROUPED_GROUP_LOOK : PLAIN_GROUP_LOOK;
}
