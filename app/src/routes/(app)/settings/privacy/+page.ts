import { readAppLock } from "#lib/app-lock/app-lock.ts";
import { linkedFolderNames } from "#lib/permissions/permissions.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  const { appInfo } = await parent();
  const [linkedFolders, appLock] = await Promise.all([
    linkedFolderNames(),
    readAppLock(appInfo.platform),
  ]);
  return { linkedFolders, appLock };
};
