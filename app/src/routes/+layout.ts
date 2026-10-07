import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import { FIRST_LAUNCH_ROUTE, needsFirstLaunch } from "$lib/first-launch/gate";
import { commands } from "$lib/ipc/bindings";
import { Notices } from "$lib/notices/notices.svelte";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, untrack }) => {
  const [appInfo, firstLaunchFinished] = await Promise.all([
    commands.appInfo(),
    commands.firstLaunchFinished(),
  ]);
  document.documentElement.dataset.platform = appInfo.platform;
  const isFirstLaunch = needsFirstLaunch(firstLaunchFinished);
  if (isFirstLaunch && untrack(() => url.pathname) !== FIRST_LAUNCH_ROUTE) {
    redirect(307, resolve(FIRST_LAUNCH_ROUTE));
  }
  return { appInfo, isFirstLaunch, notices: new Notices() };
};
