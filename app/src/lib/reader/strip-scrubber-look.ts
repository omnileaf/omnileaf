export const STRIP_SCRUBBER = {
  root: "group/scrubber absolute inset-e-sm z-1 touch-none rounded-full bg-native-top-bar-scrolled inline-touch-target reader-scrubber-frame",
  track:
    "absolute inset-x-none inset-y-lg reader-scrubber-track has-focus-visible:focus-ring",
  range:
    "absolute inset-x-none inset-bs-none mx-auto rounded-t-slider-cap rounded-b-slider-join bg-native-button-primary inline-native-slider-track reader-scrubber-range",
  rest: "absolute inset-x-none inset-be-none mx-auto rounded-t-slider-join rounded-b-slider-cap bg-native-tab-pill inline-native-slider-track reader-scrubber-rest",
  handle:
    "absolute inset-x-none inset-bs-(--handle) mx-auto -translate-y-1/2 rounded-slider-join bg-native-button-primary outline-none inline-native-slider block-native-slider-thumb data-active:block-2xs",
  count:
    "absolute inset-bs-(--handle) inset-e-full me-sm -translate-y-1/2 rounded-full bg-native-notice px-md py-xs text-native-tab leading-native-tab font-native-tab tracking-native-tab whitespace-nowrap text-native-on-notice tabular-nums",
} as const;
