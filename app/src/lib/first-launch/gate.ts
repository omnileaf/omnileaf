import type { PageRouteId } from "$app/types";
import type { commands } from "#lib/ipc/bindings.ts";

export const FIRST_LAUNCH_ROUTE = "/first-launch" satisfies PageRouteId;

type FirstLaunchFinished = Awaited<
  ReturnType<typeof commands.firstLaunchFinished>
>;

export function needsFirstLaunch(finished: FirstLaunchFinished): boolean {
  return finished.status === "ok" && !finished.data;
}
