import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import {
  FIRST_LAUNCH_ROUTE,
  needsFirstLaunch,
} from "#lib/first-launch/gate.ts";
import { commands } from "#lib/ipc/bindings.ts";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, untrack }) => {
  const [appInfo, libraryProblem] = await Promise.all([
    commands.appInfo(),
    commands.libraryProblem(),
  ]);
  document.documentElement.dataset.platform = appInfo.platform;
  if (libraryProblem !== null) {
    return { appInfo, libraryProblem, isFirstLaunch: false };
  }
  const isFirstLaunch = needsFirstLaunch(await commands.firstLaunchFinished());
  if (
    isFirstLaunch &&
    untrack(() => url.pathname) !== resolve(FIRST_LAUNCH_ROUTE)
  ) {
    redirect(307, resolve(FIRST_LAUNCH_ROUTE));
  }
  return { appInfo, libraryProblem, isFirstLaunch };
};
