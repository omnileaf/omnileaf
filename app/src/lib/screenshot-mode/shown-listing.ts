import type { LibraryListing } from "#lib/ipc/bindings.ts";

export function shownListing(
  listing: LibraryListing,
  usesStandIns: boolean,
): LibraryListing {
  return usesStandIns
    ? { ...listing, filter: { ...listing.filter, adult: "hide" } }
    : listing;
}
