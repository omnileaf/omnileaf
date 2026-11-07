import { WINDOWS_SLIDER_THUMB } from "#lib/components/ui/slider/windows-slider.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

import { usesCommandBar } from "./windows-reader-bar.ts";

export interface PageSliderLook {
  readonly root: string;
  readonly track: string;
  readonly fill: string;
  readonly thumb: string;
}

const TODAYS_LOOK: PageSliderLook = {
  root: "relative flex-1 rounded-full block-reader-dense has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent desktop:expanded:block-lg",
  track:
    "absolute inset-none my-auto overflow-hidden rounded-full bg-chip block-slider-track",
  fill: "absolute inset-y-none inset-s-none bg-accent reader-progress-fill",
  thumb:
    "absolute inset-y-none reader-progress-thumb my-auto rounded-full border border-accent bg-background shadow-card-rest",
};

const WINDOWS_LOOK: PageSliderLook = {
  root: "group/slider relative flex-1 block-native-slider",
  track:
    "absolute inset-none my-auto overflow-hidden rounded-full bg-native-progress-track block-native-slider-track",
  fill: "absolute inset-y-none inset-s-none bg-native-progress-fill reader-progress-fill",
  thumb: `absolute inset-y-none reader-progress-thumb my-auto rounded-full border [--reader-thumb:var(--spacing-native-slider-thumb)] ${WINDOWS_SLIDER_THUMB} group-has-focus-visible/slider:focus-ring group-has-focus-visible/slider:ring-1 group-has-focus-visible/slider:ring-native-focus-ring-inner`,
};

const ANDROID_PHONE_LOOK: PageSliderLook = {
  root: "group/slider reader-slider-root relative flex-1 block-native-slider has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-native-focus-ring",
  track:
    "absolute inset-x-none my-auto block-native-slider-track before:absolute before:inset-none before:rounded-slider-cap before:bg-native-tab-pill before:reader-slider-rest before:content-['']",
  fill: "absolute inset-none rounded-slider-cap bg-native-button-primary reader-slider-fill",
  thumb:
    "absolute inset-y-none block-native-slider inline-native-slider-thumb rounded-slider-join bg-native-button-primary reader-slider-handle",
};

export function pageSliderLook(
  platform: Platform,
  width: WidthClass,
): PageSliderLook {
  if (usesCommandBar(platform)) {
    return WINDOWS_LOOK;
  }
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_LOOK
    : TODAYS_LOOK;
}
