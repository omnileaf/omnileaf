export interface FilterChipLook {
  readonly chip: string;
  readonly more: string;
}

const NATIVE_TYPE =
  "text-native-button/native-button font-native-button tracking-native-button";

export const TODAYS_FILTER_CHIP_LOOK: FilterChipLook = {
  chip: "ps-search-chip-start pe-2xs block-search-chip",
  more: "shrink-0 rounded-control border border-border bg-card px-sm text-small font-medium block-search-chip touch:touch-target-around",
};

export const NATIVE_FILTER_CHIP_LOOK: FilterChipLook = {
  chip: `rounded-full border-0 bg-native-button-outline ps-md pe-sm ${NATIVE_TYPE} block-native-segment`,
  more: `shrink-0 rounded-full border-0 bg-native-button-outline px-md ${NATIVE_TYPE} block-native-segment touch:touch-target-around`,
};

export function filterChipLook(isNative: boolean): FilterChipLook {
  return isNative ? NATIVE_FILTER_CHIP_LOOK : TODAYS_FILTER_CHIP_LOOK;
}
