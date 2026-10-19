import type { ResolvedPathname } from "$app/types";

export function resolvedPathOf(url: URL): ResolvedPathname {
  return `${url.pathname}${url.search}${url.hash}` as ResolvedPathname;
}
