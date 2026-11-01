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

export const SHEET_FIELD_TEXT =
  "border-0 bg-transparent px-none py-native-field-block text-native-row-title/native-row-title tracking-native-row-title min-block-none touch:text-native-row-title/native-row-title";
