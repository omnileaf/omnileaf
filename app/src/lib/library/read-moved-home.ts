import type { LibraryFolder } from "#lib/ipc/bindings.ts";

import type { LibraryFolders } from "./library-folders.svelte";
import type { Rescans } from "./rescans.svelte";

export async function readMovedHome(
  folders: LibraryFolders,
  rescans: Rescans,
  moved: LibraryFolder["id"],
): Promise<void> {
  await folders.load();
  const folder = foundIn(folders, moved);
  if (folder === undefined) {
    return;
  }
  await rescans.rescan(folder);
  await folders.load();
}

function foundIn(
  folders: LibraryFolders,
  id: LibraryFolder["id"],
): LibraryFolder | undefined {
  const { list } = folders;
  if (list.kind !== "loaded") {
    return undefined;
  }
  const listed =
    list.home === undefined ? list.linked : [list.home, ...list.linked];
  return listed.find((folder) => folder.id === id);
}
