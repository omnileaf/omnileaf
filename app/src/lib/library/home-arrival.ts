import { FolderCheck, TriangleAlert } from "@lucide/svelte";

import { assertNever } from "#lib/assert-never.ts";
import type { HomeArrival, Platform } from "#lib/ipc/bindings.ts";
import type { Notice } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

import { folderLocation } from "./folder-location";
import type { FolderList } from "./library-folders.svelte";

let isArrivalTaken = false;

export function takeHomeArrival(
  arrival: HomeArrival | null,
): HomeArrival | null {
  if (isArrivalTaken) {
    return null;
  }
  isArrivalTaken = true;
  return arrival;
}

export function arrivalNotice(
  arrival: HomeArrival | null,
  location: string,
): Notice | undefined {
  switch (arrival) {
    case null:
      return undefined;
    case "moved":
      return {
        tone: "plain",
        icon: FolderCheck,
        title: m.home_moved_title(),
        body: m.home_moved_body({ location }),
      };
    case "moveFailed":
      return {
        tone: "warning",
        icon: TriangleAlert,
        title: m.home_move_failed_title(),
        body: m.home_move_failed_body({ location }),
      };
    default:
      return assertNever(arrival);
  }
}

export function homeArrivalNotice(
  arrival: HomeArrival | null,
  folders: FolderList,
  platform: Platform,
): Notice | undefined {
  const home = folders.kind === "loaded" ? folders.home : undefined;
  return home === undefined
    ? undefined
    : arrivalNotice(arrival, folderLocation(home, platform));
}
