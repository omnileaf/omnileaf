import { Channel } from "@tauri-apps/api/core";

import { commands } from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";

import { FolderFinder } from "./folder-finder.svelte";
import {
  noticeFolderBack,
  noticeFolderStillMissing,
} from "./missing-folder-notices.ts";

export function noticingFolderFinder(
  notices: Notices,
  onSettled: () => Promise<void>,
): FolderFinder {
  return new FolderFinder(
    ({ folder }) => commands.relocateLibraryFolder(folder.id, new Channel()),
    {
      onError: (error) => {
        reportError(error);
      },
      onShareStillUnreachable: (missing) => {
        noticeFolderStillMissing(notices, missing);
      },
      onShareBack: (missing) => {
        noticeFolderBack(notices, missing);
      },
      onSettled,
    },
  );
}
