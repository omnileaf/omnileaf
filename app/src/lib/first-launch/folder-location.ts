import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import { atEveryWidth, type WordingByWidth } from "./wording";

const IN_FILES = {
  onPhones: m.first_launch_home_location_iphone,
  fromMedium: m.first_launch_home_location_ipad,
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
