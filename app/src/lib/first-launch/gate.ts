import type { commands } from "$lib/ipc/bindings";

export const FIRST_LAUNCH_ROUTE = "/first-launch";

type FirstLaunchFinished = Awaited<
  ReturnType<typeof commands.firstLaunchFinished>
>;

/** A device that can't read whether it finished opens on the library, so a failed read never traps it in the first launch. */
export function needsFirstLaunch(finished: FirstLaunchFinished): boolean {
  return finished.status === "ok" && !finished.data;
}
