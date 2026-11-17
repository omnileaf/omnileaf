import { commands, type Platform } from "#lib/ipc/bindings.ts";

type TakeRestoredRoute = typeof commands.takeRestoredRoute;

export type RestoredRoute = (platform: Platform) => Promise<string | undefined>;

const KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export function restoredRouteOnce(
  take: TakeRestoredRoute = () => commands.takeRestoredRoute(),
): RestoredRoute {
  let isTaken = false;
  return async (platform) => {
    if (isTaken || !KEEPS_THE_ROUTE_OF_A_REBUILT_SCREEN[platform]) {
      return undefined;
    }
    isTaken = true;
    const taken = await take();
    if (taken.status === "error") {
      reportError(taken.error);
      return undefined;
    }
    return taken.data ?? undefined;
  };
}

export const takeRestoredRoute: RestoredRoute = restoredRouteOnce();
