import { Channel } from "@tauri-apps/api/core";

import { commands, type ScanProgress } from "$lib/ipc/bindings";

export type AddFolder = (
  onProgress: (progress: ScanProgress) => void,
) => ReturnType<typeof commands.addLibraryFolder>;

/** Asks for a folder and adds it, handing each step of its scan to `onProgress` as it arrives. */
export const addFolderWithProgress: AddFolder = (onProgress) =>
  commands.addLibraryFolder(new Channel(onProgress));
