import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import {
  FIRST_LAUNCH_ROUTE,
  needsFirstLaunch,
} from "#lib/first-launch/gate.ts";
import { commands } from "#lib/ipc/bindings.ts";
import { Notices } from "#lib/notices/notices.svelte.ts";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, untrack }) => {
  const [appInfo, libraryProblem] = await Promise.all([
    commands.appInfo(),
    commands.libraryProblem(),
  ]);
  document.documentElement.dataset.platform = appInfo.platform;
  const notices = new Notices();
  if (libraryProblem !== null) {
    return { appInfo, libraryProblem, isFirstLaunch: false, notices };
  }
  const isFirstLaunch = needsFirstLaunch(await commands.firstLaunchFinished());
  if (isFirstLaunch && untrack(() => url.pathname) !== FIRST_LAUNCH_ROUTE) {
    redirect(307, resolve(FIRST_LAUNCH_ROUTE));
  }
  return { appInfo, libraryProblem, isFirstLaunch, notices };
};
