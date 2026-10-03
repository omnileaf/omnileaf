import { commands } from "$lib/ipc/bindings";

/** Brings in what changed in the folders while the app was closed; the backend logs a rescan that fails. */
export async function rescanEveryFolder(): Promise<void> {
  await commands.rescanLibraryFolders();
}
