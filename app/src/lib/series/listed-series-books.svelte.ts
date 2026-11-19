import { untrack } from "svelte";

import type { SeriesBookListing } from "#lib/ipc/bindings.ts";

import { seriesBookList } from "./series-books.svelte.ts";
import type { SeriesId } from "./series-id";

type SeriesBookPages = ReturnType<typeof seriesBookList>;

function listingKey(listing: SeriesBookListing): string {
  return [
    listing.shown,
    listing.direction,
    listing.section,
    listing.volume,
  ].join(":");
}

/** Svelte only lets the effect inside run when this is called while a component initialises. */
export function listedSeriesBooks(
  series: () => SeriesId | undefined,
  listing: () => SeriesBookListing,
): { readonly pages: SeriesBookPages | undefined; startAgain(): void } {
  const listedSeries = $derived(series());
  const pages = $derived(
    listedSeries === undefined
      ? undefined
      : seriesBookList(listedSeries, listing),
  );
  const key = $derived(listingKey(listing()));
  let startedFor: string | undefined;

  $effect(() => {
    const list = pages;
    const startingFor = key;
    untrack(() => {
      startedFor = startingFor;
      void list?.start();
    });
  });

  return {
    get pages() {
      return pages;
    },
    startAgain() {
      if (key === startedFor) {
        void pages?.start();
      }
    },
  };
}
