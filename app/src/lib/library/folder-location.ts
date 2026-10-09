import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export type AppleDevice = "iphone" | "ipad";

const IPHONE = /\b(?:iPhone|iPod)\b/;
const IN_FILES = {
  iphone: m.library_home_location_iphone,
  ipad: m.library_home_location_ipad,
} satisfies Record<AppleDevice, () => string>;

/** iPhones name themselves in the web view's user agent, while iPadOS asks for desktop pages and names no device. */
export function appleDeviceOf(userAgent: string): AppleDevice {
  return IPHONE.test(userAgent) ? "iphone" : "ipad";
}

/** iOS names the home folder by the app's folder in the Files app, since its own path is a private container nobody can browse to. */
export function folderLocation(
  folder: Pick<LibraryFolder, "kind" | "location">,
  platform: Platform,
  device: AppleDevice = appleDeviceOf(navigator.userAgent),
): string {
  return platform === "ios" && folder.kind === "home"
    ? IN_FILES[device]()
    : folder.location;
}
