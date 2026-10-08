import type { LibraryFolder } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

/** Names the home folder after the app rather than its folder on disk. */
export function folderTitle(folder: LibraryFolder): string {
  return folder.kind === "home" ? m.app_name() : folder.name;
}
