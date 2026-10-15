import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import {
  FIRST_LAUNCH_ROUTE,
  needsFirstLaunch,
} from "#lib/first-launch/gate.ts";
import {
  openingPage,
  opensOnSettingForDocument,
} from "#lib/general/opens-on.svelte.ts";
import { commands } from "#lib/ipc/bindings.ts";
import { followSystemTextSize } from "#lib/page/system-text-size.ts";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, untrack }) => {
  const [appInfo, libraryProblem] = await Promise.all([
    commands.appInfo(),
    commands.libraryProblem(),
  ]);
  document.documentElement.dataset.platform = appInfo.platform;
  followSystemTextSize(appInfo.platform);
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
  if (!isFirstLaunch && untrack(() => url.pathname) === resolve("/(app)")) {
    const opening = await openingPage(opensOnSettingForDocument().choice);
    if (opening !== undefined) {
      redirect(307, opening);
    }
  }
  return { appInfo, libraryProblem, isFirstLaunch };
};
