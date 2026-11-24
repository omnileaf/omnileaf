import type { NavigationType } from "$app/navigation";

import type { ScrollPlace } from "./hold-scroll";

export const REMEMBERED_PLACES_LIMIT = 50;

export class ScrollMemory {
  readonly #places = new Map<string, ScrollPlace>();

  leave(url: URL, place: ScrollPlace): void {
    this.#places.delete(url.href);
    this.#places.set(url.href, place);
    for (const oldest of this.#places.keys()) {
      if (this.#places.size <= REMEMBERED_PLACES_LIMIT) {
        break;
      }
      this.#places.delete(oldest);
    }
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
