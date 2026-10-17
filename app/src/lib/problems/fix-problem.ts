import { Channel } from "@tauri-apps/api/core";

import {
  commands,
  type IpcError,
  type MissingFolder,
} from "#lib/ipc/bindings.ts";
import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";

import type { Problem } from "./needs-attention.svelte";

export async function fixProblem(problem: Problem): Promise<void> {
  const fixed = await fixFolder(problem.missing);
  if (fixed.status === "error") {
    reportError(fixed.error);
  }
}

type Fixed = { status: "ok" } | { status: "error"; error: IpcError };

function fixFolder({ folder, problem }: MissingFolder): Promise<Fixed> {
  switch (problem.kind) {
    case "needsSignIn":
      return commands.signInToLibraryFolder(folder.id);
    case "needsMounting":
      return rescanFolderWithProgress(folder.id, () => undefined);
    default:
      return commands.relocateLibraryFolder(folder.id, new Channel());
  }
}
