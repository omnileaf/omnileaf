import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import {
  commands,
  type IpcError,
  type MissingFolder,
} from "#lib/ipc/bindings.ts";
import type { FolderFinder } from "#lib/library/folder-finder.svelte.ts";
import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";

import type { Problem } from "./needs-attention.svelte";

export async function fixProblem(
  problem: Problem,
  finder: Pick<FolderFinder, "find">,
): Promise<void> {
  if (problem.kind === "lowSpace") {
    await goto(resolve("/(app)/settings/storage"));
    return;
  }
  const fixed = await fixFolder(problem.missing, finder);
  if (fixed.status === "error") {
    reportError(fixed.error);
  }
}

type Fixed = { status: "ok" } | { status: "error"; error: IpcError };

function fixFolder(
  missing: MissingFolder,
  finder: Pick<FolderFinder, "find">,
): Promise<Fixed> {
  switch (missing.problem.kind) {
    case "needsSignIn":
      return commands.signInToLibraryFolder(missing.folder.id);
    case "needsMounting":
      return rescanFolderWithProgress(missing.folder.id, () => undefined);
    default:
      finder.find(missing);
      return Promise.resolve({ status: "ok" });
  }
}
