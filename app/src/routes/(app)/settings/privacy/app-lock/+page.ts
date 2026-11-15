import { error } from "@sveltejs/kit";

import { readAppLock } from "#lib/app-lock/app-lock.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;

export const load: PageLoad = async ({ parent }) => {
  const { appInfo } = await parent();
  const appLock = await readAppLock(appInfo.platform);
  if (appLock === null) {
    error(NOT_FOUND, "only Android has an app lock");
  }
  return { appLock };
};
