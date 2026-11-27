import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { SvelteSet } from "svelte/reactivity";

import type { ImageLoads } from "./image-loads.svelte.ts";
import { nextPagesToAsk } from "./page-requests.ts";

export class AskedImages {
  readonly #asked = new SvelteSet<number>();
  readonly #loads: ImageLoads;

  constructor(loads: ImageLoads) {
    this.#loads = loads;
  }

  askFor(byUrgency: readonly number[]): void {
    for (const index of nextPagesToAsk(
      byUrgency,
      this.#asked,
      this.#loads.room,
    )) {
      this.#asked.add(index);
    }
  }

  askAgain(index: number): void {
    this.#asked.delete(index);
  }

  freshImage(index: number): Attachment<HTMLImageElement> {
    return () => {
      untrack(() => {
        this.#asked.delete(index);
      });
    };
  }

  loadWhenAsked(
    index: number,
    url: string,
    onStalled?: () => void,
  ): Attachment<HTMLImageElement> {
    return (image) => {
      if (this.#asked.has(index)) {
        this.#loads.load(image, url, onStalled);
      }
    };
  }
}
