import { goto } from "$app/navigation";
import type { ResolvedPathname } from "$app/types";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

import { resolvedPathOf } from "./app-path";

type AskForSavedRoute = typeof commands.savedRoute;

type TellOpeningPageShown = typeof commands.openingPageShown;

type OpenPage = (page: ResolvedPathname) => Promise<void>;

const KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export async function savedRoute(
  platform: Platform,
  ask: AskForSavedRoute = () => commands.savedRoute(),
): Promise<ResolvedPathname | undefined> {
  if (!KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN[platform]) {
    return undefined;
  }
  const saved = await ask();
  if (saved.status === "error") {
    reportError(saved.error);
    return undefined;
  }
  return saved.data === null
    ? undefined
    : resolvedPathOf(new URL(saved.data, location.href));
}

async function tellOpeningPageShown(
  platform: Platform,
  tell: TellOpeningPageShown,
): Promise<void> {
  if (!KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN[platform]) {
    return;
  }
  const told = await tell();
  if (told.status === "error") {
    reportError(told.error);
  }
}

export async function showOpeningPage(
  page: ResolvedPathname | undefined,
  platform: Platform,
  open: OpenPage = goto,
  tell: TellOpeningPageShown = () => commands.openingPageShown(),
): Promise<void> {
  if (page !== undefined) {
    await open(page);
  }
  await tellOpeningPageShown(platform, tell);
}
