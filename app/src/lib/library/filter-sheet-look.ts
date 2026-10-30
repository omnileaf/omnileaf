export const ANDROID_FILTER_SHEET = {
  header: "flex items-center gap-sm ps-lg pe-md pbe-xs",
  title:
    "flex-1 text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title",
  body: "flex flex-1 flex-col overflow-y-auto pbe-sm min-block-none",
  foot: "flex flex-col px-lg pbs-md pbe-native-sheet-foot-bottom",
  rule: "border-bs border-native-sheet-rule",
} as const;

export const FILTER_SETTING_LABEL_TYPE =
  "text-native-segment/native-segment font-native-segment tracking-native-segment";

export const ANDROID_FILTER_HEADING = `pbs-md pbe-sm ps-lg text-native-on-button-plain ${FILTER_SETTING_LABEL_TYPE}`;

export const ANDROID_FILTER_CHIP = {
  chip: "flex shrink-0 items-center gap-sm rounded-native-segment border px-lg text-native-button/native-button font-native-button tracking-native-button whitespace-nowrap block-auto min-block-native-button-small touch:touch-target-around",
  chosen: "border-transparent bg-native-accent-soft text-foreground",
  other: "border-native-button-outline-edge text-muted",
} as const;

export const ANDROID_VIEW_SETTING = {
  row: "flex flex-col gap-sm ps-lg pe-xl",
  words: "",
  note: "basis-full text-muted",
} as const;
