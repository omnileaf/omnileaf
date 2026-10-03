import type { Platform } from "$lib/ipc/bindings";
import type { WidthClass } from "$lib/page/breakpoints";

const IS_POINTER = {
  android: false,
  ios: false,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, boolean>;

/** Desktop windows show both panes from the medium width, touch screens only once a sidebar fits. */
export function showsSectionsBeside(
  platform: Platform,
  width: WidthClass,
): boolean {
  switch (width) {
    case "compact":
      return false;
    case "medium":
      return IS_POINTER[platform];
    case "expanded":
      return true;
  }
}
