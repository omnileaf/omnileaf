import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone, isPointer } from "#lib/page/platform.ts";

export type DeviceWord = "phone" | "tablet" | "computer";

export function deviceWordOf(
  platform: Platform,
  width: WidthClass,
): DeviceWord {
  if (isPointer(platform)) {
    return "computer";
  }
  return isPhone(platform, width) ? "phone" : "tablet";
}
