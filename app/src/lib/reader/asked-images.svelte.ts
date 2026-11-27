import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { SvelteSet } from "svelte/reactivity";

import type { ImageLoads } from "./image-loads.svelte.ts";
import { nextPagesToAsk } from "./page-requests.ts";

export class AskedImages {
  readonly #asked = new SvelteSet<number>();
  #notStarted: readonly number[] = [];
  readonly #loads: ImageLoads;

  constructor(loads: ImageLoads) {
    this.#loads = loads;
  }

  askFor(byUrgency: readonly number[]): void {
    this.#dropUnstartedBesides(byUrgency);
    const room = this.#loads.room - this.#notStarted.length;
    for (const index of nextPagesToAsk(byUrgency, this.#asked, room)) {
      this.#asked.add(index);
      this.#notStarted = [...this.#notStarted, index];
    }
  }

  askAgain(index: number): void {
    this.#asked.delete(index);
    this.#started(index);
  }

  freshImage(index: number): Attachment<HTMLImageElement> {
    return () => {
      untrack(() => {
        this.askAgain(index);
      });
    };
  }

  #started(index: number): void {
    this.#notStarted = this.#notStarted.filter((waiting) => waiting !== index);
  }

  #dropUnstartedBesides(byUrgency: readonly number[]): void {
    for (const index of this.#notStarted) {
      if (!byUrgency.includes(index)) {
        this.askAgain(index);
      }
    }
  }

  loadWhenAsked(
    index: number,
    url: string,
    onStalled?: () => void,
  ): Attachment<HTMLImageElement> {
    return (image) => {
      if (this.#asked.has(index)) {
        this.#started(index);
        this.#loads.load(image, url, onStalled);
      }
    };
  }
}
