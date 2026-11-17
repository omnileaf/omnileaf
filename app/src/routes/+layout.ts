import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { boldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import { textSizeChoice } from "#lib/accessibility/text-size-choice.svelte.ts";
import { touchChoices } from "#lib/accessibility/touch-choices.svelte.ts";
import { rememberLockWords } from "#lib/app-lock/app-lock.ts";
import { assertNever } from "#lib/assert-never.ts";
import {
  FIRST_LAUNCH_ROUTE,
  needsFirstLaunch,
} from "#lib/first-launch/gate.ts";
import {
  type Opening,
  openingPage,
  opensOnSettingForDocument,
} from "#lib/general/opens-on.svelte.ts";
import { commands } from "#lib/ipc/bindings.ts";
import { takeRestoredRoute } from "#lib/navigation/restored-route.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { followSystemBoldText } from "#lib/page/system-bold-text.ts";
import { followSystemContrast } from "#lib/page/system-contrast.ts";
import { followSystemTextSize } from "#lib/page/system-text-size.ts";

import type { LayoutLoad } from "./$types";

export const ssr = false;

function pageToRestoreFor(opening: Opening): ResolvedPathname | undefined {
  switch (opening.kind) {
    case "stays":
      return undefined;
    case "opensOn":
      return redirect(307, opening.page);
    case "restores":
      return opening.page;
    default:
      return assertNever(opening);
  }
}

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
    return {
      appInfo,
      libraryProblem,
      homeArrival,
      isFirstLaunch: false,
      pageToRestore: undefined,
    };
  }
  const isFirstLaunch = needsFirstLaunch(await commands.firstLaunchFinished());
  if (
    isFirstLaunch &&
    untrack(() => url.pathname) !== resolve(FIRST_LAUNCH_ROUTE)
  ) {
    redirect(307, resolve(FIRST_LAUNCH_ROUTE));
  }
  const opensTheApp =
    !isFirstLaunch && untrack(() => url.pathname) === resolve("/(app)");
  const pageToRestore = opensTheApp
    ? pageToRestoreFor(
        await openingPage(
          opensOnSettingForDocument().choice,
          await takeRestoredRoute(appInfo.platform),
        ),
      )
    : undefined;
  return {
    appInfo,
    libraryProblem,
    homeArrival,
    isFirstLaunch,
    pageToRestore,
  };
};
