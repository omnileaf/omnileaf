import { FolderCheck, TriangleAlert } from "@lucide/svelte";

import { assertNever } from "#lib/assert-never.ts";
import type { HomeArrival } from "#lib/ipc/bindings.ts";
import type { Notice } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

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
