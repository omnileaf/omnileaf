import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPointer } from "#lib/page/platform.ts";

/** Desktop windows show both panes from the medium width, touch screens only once a sidebar fits. */
export function showsSectionsBeside(
  platform: Platform,
  width: WidthClass,
): boolean {
  switch (width) {
    case "compact":
      return false;
    case "medium":
      return isPointer(platform);
    case "expanded":
      return true;
  }
}
