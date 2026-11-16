import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import { boldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import { textSizeChoice } from "#lib/accessibility/text-size-choice.svelte.ts";
import { touchChoices } from "#lib/accessibility/touch-choices.svelte.ts";
import { rememberLockWords } from "#lib/app-lock/app-lock.ts";
import {
  FIRST_LAUNCH_ROUTE,
  needsFirstLaunch,
} from "#lib/first-launch/gate.ts";
import {
  openingPage,
  opensOnSettingForDocument,
} from "#lib/general/opens-on.svelte.ts";
import { commands } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { followSystemBoldText } from "#lib/page/system-bold-text.ts";
import { followSystemContrast } from "#lib/page/system-contrast.ts";
import { followSystemTextSize } from "#lib/page/system-text-size.ts";

import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ url, untrack }) => {
  const [appInfo, libraryProblem, homeArrival] = await Promise.all([
    commands.appInfo(),
    commands.libraryProblem(),
    commands.homeArrival(),
  ]);
  followCorePlatform(appInfo.platform);
  followSystemTextSize(appInfo.platform);
  followSystemContrast(appInfo.platform);
  textSizeChoice.markDocument();
  boldTextChoice.markDocument();
  void followSystemBoldText(appInfo.platform);
  touchChoices.markDocument();
  void rememberLockWords();
  if (libraryProblem !== null) {
    return { appInfo, libraryProblem, homeArrival, isFirstLaunch: false };
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
  return { appInfo, libraryProblem, homeArrival, isFirstLaunch };
};
