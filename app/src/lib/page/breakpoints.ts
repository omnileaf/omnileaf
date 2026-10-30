import { MediaQuery } from "svelte/reactivity";

import type { Platform } from "#lib/ipc/bindings.ts";

export type WidthClass = "compact" | "medium" | "expanded";

export const MEDIUM_QUERY = "(min-width: 600px)";
export const EXPANDED_QUERY = "(min-width: 840px)";
export const COMPACT_SIDE_QUERY =
  "(max-width: 599.98px), (max-height: 599.98px)";
export const NARROW_POINTER_QUERY = "(hover: hover) and (max-width: 839.98px)";
const WINDOWS_COMPACT_PANE_QUERY = "(max-width: 1007.98px)";

export function paneFoldQuery(platform: Platform): string {
  return platform === "windows"
    ? WINDOWS_COMPACT_PANE_QUERY
    : NARROW_POINTER_QUERY;
}

export class WindowWidth {
  readonly #isMedium = new MediaQuery(MEDIUM_QUERY);
  readonly #isExpanded = new MediaQuery(EXPANDED_QUERY);

  get current(): WidthClass {
    if (this.#isExpanded.current) {
      return "expanded";
    }
    return this.#isMedium.current ? "medium" : "compact";
  }
}
