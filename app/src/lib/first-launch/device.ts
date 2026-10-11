import type { Platform } from "#lib/ipc/bindings.ts";

export type DeviceKind = "phone" | "desktop";

export function deviceKindOf(platform: Platform): DeviceKind {
  switch (platform) {
    case "android":
    case "ios":
      return "phone";
    case "macos":
    case "windows":
    case "linux":
      return "desktop";
  }
}
