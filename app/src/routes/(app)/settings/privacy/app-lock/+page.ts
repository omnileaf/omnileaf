import { error } from "@sveltejs/kit";

import { readAppLock } from "#lib/app-lock/app-lock.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;
const NOT_READ = 500;

export const load: PageLoad = async () => {
  const appLock = await readAppLock();
  if (appLock.kind === "unavailable") {
    error(NOT_FOUND, "the app lock isn't offered here");
  }
  if (appLock.kind === "failed") {
    reportError(appLock.error);
    error(NOT_READ, `read the app lock: ${appLock.error.message}`);
  }
  return { appLock: appLock.lock };
};
