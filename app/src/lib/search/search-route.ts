export const SEARCH_QUERY_PARAMETER = "q";

/** The query that opens the search page with the text in its field. */
export function searchQuery(text: string): `?${string}` {
  const query = new URLSearchParams({ [SEARCH_QUERY_PARAMETER]: text });
  return `?${query.toString()}`;
}
