import { Channel } from "@tauri-apps/api/core";

import { commands, type ScanProgress } from "#lib/ipc/bindings.ts";

export type AddFolder = (
  onProgress: (progress: ScanProgress) => void,
) => ReturnType<typeof commands.addLibraryFolder>;

export const addFolderWithProgress: AddFolder = (onProgress) =>
  commands.addLibraryFolder(new Channel(onProgress));

export function linkFolderWithProgress(folder: string): AddFolder {
  return (onProgress) =>
    commands.linkLibraryFolder(folder, new Channel(onProgress));
}
