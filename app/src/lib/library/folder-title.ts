import type { LibraryFolder } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export function folderTitle(folder: LibraryFolder): string {
  return folder.kind === "home" ? m.app_name() : folder.name;
}
