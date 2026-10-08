import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
import { atEveryWidth, type WordingByWidth } from "#lib/page/wording.ts";
import { m } from "#lib/paraglide/messages.js";

const IN_FILES = {
  onPhones: m.library_home_location_iphone,
  fromMedium: m.library_home_location_ipad,
} satisfies WordingByWidth;

/** iOS names the home folder by the app's folder in the Files app, since its own path is a private container nobody can browse to. */
export function folderLocation(
  folder: Pick<LibraryFolder, "kind" | "location">,
  platform: Platform,
): WordingByWidth {
  return platform === "ios" && folder.kind === "home"
    ? IN_FILES
    : atEveryWidth(() => folder.location);
}
