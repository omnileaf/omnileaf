import type { Platform } from "$lib/ipc/bindings";
import type { WidthClass } from "$lib/page/breakpoints";

const POINTER_PLATFORMS: ReadonlySet<Platform> = new Set([
  "linux",
  "macos",
  "windows",
]);

/** Desktop windows show both panes from the medium width, touch screens only once a sidebar fits. */
export function showsSectionsBeside(
  platform: Platform,
  width: WidthClass,
): boolean {
  switch (width) {
    case "compact":
      return false;
    case "medium":
      return POINTER_PLATFORMS.has(platform);
    case "expanded":
      return true;
  }
}
