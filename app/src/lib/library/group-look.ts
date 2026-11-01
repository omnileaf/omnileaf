import { GROUP_PLATE } from "#lib/page/plates.ts";

export interface GroupLook {
  readonly section: string;
  readonly heading: string;
  readonly group: string;
  readonly choices: string;
  readonly choice: string;
  readonly followingHeading: string;
}

const PLAIN_GROUP = "flex flex-col divide-y divide-border";

export const PLAIN_GROUP_LOOK: GroupLook = {
  section: "",
  heading: "text-small font-semibold",
  group: PLAIN_GROUP,
  choices: PLAIN_GROUP,
  choice: "py-setting-grid-pad",
  followingHeading: "pbs-xl",
};

export const GROUPED_HEADING_TYPE =
  "text-native-row-title/native-row-title tracking-native-row-title font-native-group-header text-muted";

const GROUPED_GROUP = `flex flex-col divide-y divide-border overflow-hidden px-lg ios-grouped:divide-ios-separator ${GROUP_PLATE}`;

export const GROUPED_GROUP_LOOK: GroupLook = {
  section: "px-lg",
  heading: `ps-lg ${GROUPED_HEADING_TYPE} mbe-sm`,
  group: GROUPED_GROUP,
  choices: GROUPED_GROUP,
  choice: "py-setting-grid-pad",
  followingHeading: "",
};

export const POPOVER_GROUP_LOOK: GroupLook = {
  section: "gap-native-popover-gap",
  heading:
    "px-lg text-native-group-footer/native-group-footer tracking-native-group-footer font-native-group-header text-muted",
  group: "flex flex-col divide-y divide-ios-separator ps-lg *:pe-lg",
  choices: "flex flex-col gap-native-popover-gap *:px-lg",
  choice: "",
  followingHeading: "",
};

export const GROUPED_FOOTNOTE_TYPE =
  "text-native-group-footer/native-group-footer tracking-native-group-footer text-muted";

export const GROUPED_FOOTNOTE = `ps-lg ${GROUPED_FOOTNOTE_TYPE} mbs-sm`;

export function groupLook(isGrouped: boolean): GroupLook {
  return isGrouped ? GROUPED_GROUP_LOOK : PLAIN_GROUP_LOOK;
}
