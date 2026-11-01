import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
import { FILTER_SETTING_LABEL_TYPE } from "#lib/library/filter-sheet-look.ts";

export interface RadiosLook {
  readonly section: string;
  readonly heading: string;
  readonly group: string;
  readonly row: string;
  readonly mark: string;
  readonly markOn: string;
  readonly markOff: string;
  readonly dot: string;
  readonly words: string;
  readonly label: string;
  readonly hint: string;
}

const ACCENT_DOT =
  "rounded-full bg-accent block-radio-dot inline-radio-dot android:bg-native-button-primary";

const TODAYS_LOOK: RadiosLook = {
  section:
    "flex flex-col gap-sm rounded-card border border-border bg-card p-list-row",
  heading: "font-semibold",
  group: "flex flex-col divide-y divide-border",
  row: "flex items-start gap-md rounded-control py-sm text-start transition-control inline-full hover:tint-hover focus-visible:outline-offset-2 active:tint-pressed touch:min-block-touch-target",
  mark: "mbs-2xs flex shrink-0 items-center justify-center rounded-full border block-radio inline-radio android:border-2",
  markOn: "border-radio-edge-on",
  markOff: "border-control-edge",
  dot: ACCENT_DOT,
  words: "flex flex-col gap-2xs",
  label: "font-medium",
  hint: "text-footnote text-muted",
};

const ANDROID_PHONE_LOOK: RadiosLook = {
  section: "-mx-page-start -me-page-end flex flex-col",
  heading: `pbs-md pbe-sm ps-lg text-native-on-button-plain ${FILTER_SETTING_LABEL_TYPE}`,
  group: "flex flex-col",
  row: `flex items-center gap-lg py-2xs ps-lg pe-xl text-start text-body transition-control inline-full hover:tint-hover focus-visible:outline-offset-2 active:tint-pressed min-block-touch-target`,
  mark: "flex shrink-0 items-center justify-center rounded-full border-2 block-radio inline-radio",
  markOn: "border-radio-edge-on",
  markOff: "border-control-edge",
  dot: ACCENT_DOT,
  words: "flex flex-col break-words min-inline-none",
  label: "",
  hint: `text-muted ${ROW_SUBTITLE_TYPE}`,
};

export const MACOS_RADIOS_LOOK: RadiosLook = {
  section: "flex flex-col gap-xs",
  heading:
    "px-sm text-native-list-sub/native-list-sub font-native-button-large tracking-native-list-sub text-muted",
  group:
    "flex flex-col items-start gap-native-radio-stack rounded-native-group bg-native-group px-native-group-inset py-md",
  row: "flex items-start gap-native-radio-words-gap text-start text-native-button/native-button font-native-button",
  mark: "flex shrink-0 items-center justify-center rounded-full block-radio inline-radio",
  markOn: "bg-accent",
  markOff: "bg-native-radio-field shadow-native-radio-rim",
  dot: "rounded-full bg-on-accent block-radio-dot inline-radio-dot",
  words: "flex flex-col",
  label: "",
  hint: "text-native-list-sub/native-list-sub font-regular tracking-native-list-sub text-muted",
};

export function radiosLook(isAndroidPhone: boolean): RadiosLook {
  return isAndroidPhone ? ANDROID_PHONE_LOOK : TODAYS_LOOK;
}
