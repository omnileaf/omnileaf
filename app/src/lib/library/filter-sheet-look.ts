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
