import { readAppLock } from "#lib/app-lock/app-lock.ts";
import { linkedFolderNames } from "#lib/permissions/permissions.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
  const [linkedFolders, appLock] = await Promise.all([
    linkedFolderNames(),
    readAppLock(),
  ]);
  if (appLock.kind === "failed") {
    reportError(appLock.error);
  }
  return { linkedFolders, appLock };
};
