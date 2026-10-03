import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import { FIRST_LAUNCH_ROUTE, needsFirstLaunch } from "$lib/first-launch/gate";
import { commands } from "$lib/ipc/bindings";
import {
  browserLanguageStore,
  markLanguage,
  useChosenLanguage,
} from "$lib/language/language";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, untrack }) => {
  useChosenLanguage(browserLanguageStore());
  markLanguage(document.documentElement);
  const [appInfo, firstLaunchFinished] = await Promise.all([
    commands.appInfo(),
    commands.firstLaunchFinished(),
  ]);
  document.documentElement.dataset.platform = appInfo.platform;
  const isFirstLaunch = needsFirstLaunch(firstLaunchFinished);
  if (isFirstLaunch && untrack(() => url.pathname) !== FIRST_LAUNCH_ROUTE) {
    redirect(307, resolve(FIRST_LAUNCH_ROUTE));
  }
  return { appInfo, isFirstLaunch };
};
