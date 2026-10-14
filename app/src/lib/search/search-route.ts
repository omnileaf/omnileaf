import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";

const TYPED_PARAMETER = "q";

export function searchQuery(text: string): `?${string}` {
  const query = new URLSearchParams({ [TYPED_PARAMETER]: text });
  return `?${query.toString()}`;
}

export function searchTextIn(url: {
  readonly searchParams: Pick<URLSearchParams, "get">;
}): string {
  const typed = url.searchParams.get(TYPED_PARAMETER) ?? "";
  return Array.from(typed).slice(0, SEARCH_MAX_CHARS).join("");
}
