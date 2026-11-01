import type { LibrarySeries, Platform } from "#lib/ipc/bindings.ts";

import { coverTileLook } from "./cover-tile";

export function isNotConnected(
  series: Pick<LibrarySeries, "isConnected">,
  platform: Platform,
): boolean {
  return (
    !series.isConnected && coverTileLook(platform).notConnected !== undefined
  );
}
