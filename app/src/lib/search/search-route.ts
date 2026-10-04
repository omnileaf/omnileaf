import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";

const TYPED_PARAMETER = "q";
const TITLE_PARAMETER = "title";

/** What the search page is asked to find: text someone typed, read for filter words, or a title chosen, read as it is. */
export type AskedSearch =
  | { readonly kind: "typed"; readonly text: string }
  | { readonly kind: "title"; readonly text: string };

/** The query that opens the search page with the text in its field. */
export function searchQuery(text: string): `?${string}` {
  const query = new URLSearchParams({ [TYPED_PARAMETER]: text });
  return `?${query.toString()}`;
}

/** The query that opens the search page on a title chosen elsewhere. */
export function titleQuery(title: string): `?${string}` {
  const query = new URLSearchParams({ [TITLE_PARAMETER]: title });
  return `?${query.toString()}`;
}

/** What the search page at `url` is asked to find, cut to the characters a search reads. */
export function searchAskedIn(url: {
  readonly searchParams: Pick<URLSearchParams, "get">;
}): AskedSearch {
  const title = url.searchParams.get(TITLE_PARAMETER);
  if (title !== null) {
    return { kind: "title", text: toSearchLimit(title) };
  }
  const typed = url.searchParams.get(TYPED_PARAMETER) ?? "";
  return { kind: "typed", text: toSearchLimit(typed) };
}

function toSearchLimit(text: string): string {
  return Array.from(text).slice(0, SEARCH_MAX_CHARS).join("");
}
