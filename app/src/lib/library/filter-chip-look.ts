export interface FilterChipLook {
  readonly chip: string;
  readonly more: string;
  readonly removeSize: number;
}

const NATIVE_TYPE =
  "text-native-button/native-button font-native-button tracking-native-button";

export const TODAYS_FILTER_CHIP_LOOK: FilterChipLook = {
  chip: "ps-search-chip-start pe-2xs block-search-chip",
  more: "shrink-0 rounded-control border border-border bg-card px-sm text-small font-medium block-search-chip touch:touch-target-around",
  removeSize: 12,
};

export const NATIVE_FILTER_CHIP_LOOK: FilterChipLook = {
  chip: `rounded-full border-0 bg-native-button-outline ps-md pe-sm ${NATIVE_TYPE} block-native-segment`,
  more: `shrink-0 rounded-full border-0 bg-native-button-outline px-md ${NATIVE_TYPE} block-native-segment touch:touch-target-around`,
  removeSize: 12,
};

export const ANDROID_FILTER_CHIP_LOOK: FilterChipLook = {
  chip: `rounded-native-segment border border-native-button-outline-edge ps-md pe-sm text-muted ${NATIVE_TYPE} block-auto min-block-native-button-small`,
  more: `shrink-0 justify-center rounded-native-segment border border-native-button-outline-edge px-md text-muted ${NATIVE_TYPE} block-auto min-block-native-button-small touch:touch-target-around`,
  removeSize: 18,
};

export function filterChipLook(
  phone: "ios" | "android" | undefined,
): FilterChipLook {
  if (phone === "android") {
    return ANDROID_FILTER_CHIP_LOOK;
  }
  return phone === "ios" ? NATIVE_FILTER_CHIP_LOOK : TODAYS_FILTER_CHIP_LOOK;
}
