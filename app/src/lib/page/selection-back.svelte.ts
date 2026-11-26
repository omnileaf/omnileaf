import { untrack } from "svelte";

import { holdBack } from "#lib/navigation/overlay-back.ts";

export function endsOnBack(isSelecting: () => boolean, end: () => void): void {
  $effect(() => {
    if (!isSelecting()) {
      return;
    }
    return untrack(() => holdBack(end));
  });
}
