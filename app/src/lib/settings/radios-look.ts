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
  readonly words: string;
  readonly label: string;
  readonly hint: string;
}

const TODAYS_LOOK: RadiosLook = {
  section:
    "flex flex-col gap-sm rounded-card border border-border bg-card p-list-row",
  heading: "font-semibold",
  group: "flex flex-col divide-y divide-border",
  row: "flex items-start gap-md rounded-control py-sm text-start transition-control inline-full hover:tint-hover focus-visible:outline-offset-2 active:tint-pressed touch:min-block-touch-target",
  mark: "mbs-2xs flex shrink-0 items-center justify-center rounded-full border block-radio inline-radio android:border-2",
  markOn: "border-radio-edge-on",
  markOff: "border-control-edge",
  words: "flex flex-col gap-2xs",
  label: "font-medium",
  hint: "text-footnote text-muted",
};

const ANDROID_PHONE_LOOK: RadiosLook = {
  section: "flex flex-col",
  heading: `pbs-md pbe-sm ps-lg text-native-on-button-plain ${FILTER_SETTING_LABEL_TYPE}`,
  group: "flex flex-col",
  row: `flex items-center gap-lg py-2xs ps-lg pe-xl text-start text-body transition-control inline-full hover:tint-hover focus-visible:outline-offset-2 active:tint-pressed min-block-touch-target`,
  mark: "flex shrink-0 items-center justify-center rounded-full border-2 block-radio inline-radio",
  markOn: "border-accent",
  markOff: "border-muted",
  words: "flex flex-col",
  label: "",
  hint: `text-muted ${ROW_SUBTITLE_TYPE}`,
};

export function radiosLook(isAndroidPhone: boolean): RadiosLook {
  return isAndroidPhone ? ANDROID_PHONE_LOOK : TODAYS_LOOK;
}
