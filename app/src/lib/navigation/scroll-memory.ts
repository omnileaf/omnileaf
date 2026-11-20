import type { NavigationType } from "$app/navigation";

import type { ScrollPlace } from "./hold-scroll";

export class ScrollMemory {
  readonly #places = new Map<string, ScrollPlace>();

  leave(url: URL, place: ScrollPlace): void {
    this.#places.set(url.href, place);
  }

  placeToRestore(type: NavigationType, url: URL): ScrollPlace | undefined {
    if (type !== "popstate") {
      return undefined;
    }
    const place = this.#places.get(url.href);
    this.#places.delete(url.href);
    return place;
  }
}
