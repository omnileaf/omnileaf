import { Channel } from "@tauri-apps/api/core";

import { commands, type ScanProgress } from "#lib/ipc/bindings.ts";

export type RescanFolder = (
  id: Parameters<typeof commands.rescanLibraryFolder>[0],
  onProgress: (progress: ScanProgress) => void,
) => ReturnType<typeof commands.rescanLibraryFolder>;

export const rescanFolderWithProgress: RescanFolder = (id, onProgress) =>
  commands.rescanLibraryFolder(id, new Channel(onProgress));

/** Brings in what changed in the folders while the app was closed; the backend logs a rescan that fails. */
export async function rescanEveryFolder(): Promise<void> {
  await commands.rescanLibraryFolders();
}
