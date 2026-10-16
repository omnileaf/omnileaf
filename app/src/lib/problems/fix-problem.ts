import { Channel } from "@tauri-apps/api/core";

import { commands } from "#lib/ipc/bindings.ts";
import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";

import type { Problem } from "./needs-attention.svelte";

export async function fixProblem(problem: Problem): Promise<void> {
  const { folder, problem: kind } = problem.missing;
  const fixed =
    kind === "needsSignIn"
      ? await rescanFolderWithProgress(folder.id, () => undefined)
      : await commands.relocateLibraryFolder(folder.id, new Channel());
  if (fixed.status === "error") {
    reportError(fixed.error);
  }
}
