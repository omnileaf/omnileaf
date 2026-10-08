import { error } from "@sveltejs/kit";

import type { PageLoad } from "./$types";

/** A release build has no Advanced section, so its address is as missing as any other unknown one. */
export const load: PageLoad = async ({ parent }) => {
  const { appInfo } = await parent();
  if (!appInfo.isDevelopmentBuild) {
    error(404, "Not Found");
  }
};
