import type { LibraryFolder } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export type ShownFolder = Pick<
  LibraryFolder,
  "kind" | "name" | "location" | "isAvailable"
>;

export function folderTitle(
  folder: Pick<LibraryFolder, "kind" | "name">,
): string {
  return folder.kind === "home" ? m.app_name() : folder.name;
}
