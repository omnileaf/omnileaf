import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
import {
  GROUPED_FOOTNOTE_TYPE,
  GROUPED_HEADING_TYPE,
} from "#lib/library/group-look.ts";

export const SHEET_FIELD_HEAD =
  "flex items-center gap-sm ps-lg pe-native-group-head-end mbe-native-group-head-below min-block-native-button";

export const SHEET_FIELD_HEADING = `flex-1 ${GROUPED_HEADING_TYPE}`;

export const SHEET_FIELD_STATUS = `whitespace-nowrap ${GROUPED_FOOTNOTE_TYPE}`;

export const SHEET_FIELD_UNDO_ICON_SIZE = 18;

export const SHEET_FIELD_CARD =
  "flex flex-col justify-center border-0 px-lg py-none min-block-native-row";

const SHEET_FIELD_TEXT =
  "border-0 bg-transparent px-none text-native-row-title/native-row-title tracking-native-row-title min-block-none touch:text-native-row-title/native-row-title";

export const SHEET_TITLE_TEXT = `${SHEET_FIELD_TEXT} py-native-title-field-block`;

export const SHEET_SUMMARY_TEXT = `${SHEET_FIELD_TEXT} py-native-field-block`;

export const SHEET_ROW_TITLE =
  "text-native-row-title/native-row-title tracking-native-row-title font-native-row-title";

export const SHEET_LIST_CARD = "overflow-hidden border-0 p-none";

export const SHEET_SWITCH_CARD = "border-0 px-native-row-start py-none";

export const SHEET_CHIP_ROW =
  "flex flex-wrap gap-sm px-native-row-start pbs-native-row-block pbe-native-row-chips-end";

const SHEET_ADD_ROW_LAYOUT = `relative flex items-center gap-native-row-gap ps-native-row-start pe-native-row-end text-start ${SHEET_ROW_TITLE} inline-full min-block-native-row after:absolute after:inset-s-native-row-rule-start after:inset-e-none after:inset-bs-none after:bg-native-row-rule after:block-native-hairline`;

export const SHEET_ADD_ROW = `${SHEET_ADD_ROW_LAYOUT} text-native-on-button-plain ${ROW_FOCUS_RING} active:bg-native-row-pressed`;

export const SHEET_ADD_ROW_TYPING = SHEET_ADD_ROW_LAYOUT;

export const SHEET_ADD_ROW_LEAD =
  "flex shrink-0 items-center justify-center text-native-on-button-plain inline-native-row-add-lead";

export const SHEET_ADD_ROW_ICON_SIZE = 20;

export const SHEET_ADD_ROW_FIELD = `border-0 px-none text-foreground ${SHEET_ROW_TITLE}`;

export const SHEET_SWITCH_ROW =
  "flex items-center gap-native-row-gap min-block-native-row-two";

export const SHEET_SWITCH_WORDS =
  "flex flex-1 flex-col py-native-row-block min-inline-none";
