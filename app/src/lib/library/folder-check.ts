import type { IpcError, LibraryFolder } from "#lib/ipc/bindings.ts";

import type { MissingFolderLookup } from "./folder-finder.svelte";

export type FolderCheck = "back" | "stillAway" | "nothingAway";

export type CheckedAgain =
  | { readonly status: "ok"; readonly data: FolderCheck }
  | { readonly status: "error"; readonly error: IpcError };

export type RescanAway = (
  id: LibraryFolder["id"],
) => Promise<
  | { readonly status: "ok" }
  | { readonly status: "error"; readonly error: IpcError }
>;

export async function checkFolderAgain(
  lookup: () => MissingFolderLookup,
  rescan: RescanAway,
): Promise<CheckedAgain> {
  const before = await lookup();
  if (before.status === "error") {
    return before;
  }
  if (before.data === null) {
    return { status: "ok", data: "nothingAway" };
  }
  const rescanned = await rescan(before.data.folder.id);
  if (rescanned.status === "error") {
    return rescanned;
  }
  const after = await lookup();
  if (after.status === "error") {
    return after;
  }
  return { status: "ok", data: after.data === null ? "back" : "stillAway" };
}
