import { MediaQuery } from "svelte/reactivity";

export type WidthClass = "compact" | "medium" | "expanded";

export const MEDIUM_QUERY = "(min-width: 600px)";
export const EXPANDED_QUERY = "(min-width: 840px)";

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
