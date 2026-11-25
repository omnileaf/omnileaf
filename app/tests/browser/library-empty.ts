import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import type {
  LibraryCategory,
  LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";

export const MANGA_AND_TEST = [
  { id: "manga", name: "Manga" },
  { id: "test", name: "Test" },
] as LibraryCategory[];

export const UNREAD_ONLY: LibraryListing = {
  ...NEW_LIBRARY_LISTING,
  filter: { ...NEW_LIBRARY_LISTING.filter, unread: "only" },
};

export function noMatches(page: Page): Locator {
  return page.getByRole("region", { name: english.library_no_matches_title });
}

export function nothingNew(page: Page): Locator {
  return page.getByRole("region", { name: english.library_new_chapters_empty });
}

export function emptyCategory(page: Page, name: string): Locator {
  return page.getByRole("region", {
    name: english.library_category_empty.replace("{name}", name),
  });
}
