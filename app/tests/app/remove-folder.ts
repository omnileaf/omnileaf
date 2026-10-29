import { rm } from "node:fs/promises";

const BUSY_RETRIES = 10;
const BUSY_RETRY_DELAY_MS = 50;

/** Windows keeps a file locked for a moment after the process holding it exits, so deleting its folder right after the app stops fails with EBUSY. */
export function removeFolder(folder: string): Promise<void> {
  return rm(folder, {
    recursive: true,
    force: true,
    maxRetries: BUSY_RETRIES,
    retryDelay: BUSY_RETRY_DELAY_MS,
  });
}
