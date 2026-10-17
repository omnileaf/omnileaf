import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export type AppleDevice = "iphone" | "ipad";

const IPHONE = /\b(?:iPhone|iPod)\b/;
const PLACE_SEPARATOR = " › ";
const IN_FILES = {
  iphone: m.library_home_location_iphone,
  ipad: m.library_home_location_ipad,
} satisfies Record<AppleDevice, () => string>;
const ON_THE_DEVICE = {
  iphone: m.library_files_on_my_iphone,
  ipad: m.library_files_on_my_ipad,
} satisfies Record<AppleDevice, () => string>;

interface FilesPlace {
  readonly within: RegExp;
  readonly above: (device: AppleDevice) => string[];
}

/** iOS keeps iCloud Drive under Mobile Documents, the folders made On My iPhone in the Files app's provider storage, and each connected drive in a LiveFiles folder named for the drive. */
const FILES_PLACES: readonly FilesPlace[] = [
  {
    within: /\/Mobile Documents\/com~apple~CloudDocs\/(.+)$/,
    above: () => [m.library_files_icloud_drive()],
  },
  {
    within:
      /\/Containers\/Shared\/AppGroup\/[^/]+\/File Provider Storage\/(.+)$/,
    above: (device) => [ON_THE_DEVICE[device]()],
  },
  {
    within: /\/Library\/LiveFiles\/[^/]+\/(.+)$/,
    above: () => [],
  },
];

/** iPhones name themselves in the web view's user agent, while iPadOS asks for desktop pages and names no device. */
export function appleDeviceOf(userAgent: string): AppleDevice {
  return IPHONE.test(userAgent) ? "iphone" : "ipad";
}

function folders(path: string): string[] {
  return path.split("/").filter((folder) => folder !== "");
}

/** iOS paths run through private containers, so a linked folder is named by where the Files app shows it, or by its own name where that can't be told. */
function placeInFiles(path: string, device: AppleDevice): string {
  for (const { within, above } of FILES_PLACES) {
    const inside = within.exec(path)?.[1];
    if (inside !== undefined) {
      return [...above(device), ...folders(inside)].join(PLACE_SEPARATOR);
    }
  }
  return folders(path).slice(-1).join(PLACE_SEPARATOR);
}

/** iOS names the home folder by the app's folder in the Files app, since its own path is a private container nobody can browse to. */
export function folderLocation(
  folder: Pick<LibraryFolder, "kind" | "location">,
  platform: Platform,
  device: AppleDevice = appleDeviceOf(navigator.userAgent),
): string {
  if (platform !== "ios") {
    return folder.location;
  }
  return folder.kind === "home"
    ? IN_FILES[device]()
    : placeInFiles(folder.location, device);
}
