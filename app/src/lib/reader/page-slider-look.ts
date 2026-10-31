import { WINDOWS_SLIDER_THUMB } from "#lib/components/ui/slider/windows-slider.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

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

export function pageSliderLook(platform: Platform): PageSliderLook {
  return usesCommandBar(platform) ? WINDOWS_LOOK : TODAYS_LOOK;
}
