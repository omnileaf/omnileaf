import { linkedFolderNames } from "#lib/permissions/permissions.ts";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => ({
  linkedFolders: await linkedFolderNames(),
});
