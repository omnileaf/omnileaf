import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";

const TYPED_PARAMETER = "q";

/** The query that opens the search page with the text in its field. */
export function searchQuery(text: string): `?${string}` {
  const query = new URLSearchParams({ [TYPED_PARAMETER]: text });
  return `?${query.toString()}`;
}

/** The text the search page at `url` is asked to find, cut to the characters a search reads. */
export function searchTextIn(url: {
  readonly searchParams: Pick<URLSearchParams, "get">;
}): string {
  const typed = url.searchParams.get(TYPED_PARAMETER) ?? "";
  return Array.from(typed).slice(0, SEARCH_MAX_CHARS).join("");
}
