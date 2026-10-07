import type { Platform } from "$lib/ipc/bindings";

/** Which device the first launch's wording speaks of, since the steps promise what stays on it. */
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
