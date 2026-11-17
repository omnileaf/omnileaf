import type { ResolvedPathname } from "$app/types";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

import { resolvedPathOf } from "./app-path";

type AskForSavedRoute = typeof commands.takeRestoredRoute;

type TellOpeningPageShown = typeof commands.openingPageShown;

const KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export async function takeRestoredRoute(
  platform: Platform,
  ask: AskForSavedRoute = () => commands.takeRestoredRoute(),
): Promise<ResolvedPathname | undefined> {
  if (!KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN[platform]) {
    return undefined;
  }
  const taken = await ask();
  if (taken.status === "error") {
    reportError(taken.error);
    return undefined;
  }
  return taken.data === null
    ? undefined
    : resolvedPathOf(new URL(taken.data, location.href));
}

export async function tellOpeningPageShown(
  platform: Platform,
  tell: TellOpeningPageShown = () => commands.openingPageShown(),
): Promise<void> {
  if (!KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN[platform]) {
    return;
  }
  const told = await tell();
  if (told.status === "error") {
    reportError(told.error);
  }
}
