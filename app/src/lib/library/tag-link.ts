const TAG_PARAMETER = "tag";

export function tagQuery(tag: string): `?${string}` {
  return `?${new URLSearchParams({ [TAG_PARAMETER]: tag }).toString()}`;
}

export function tagIn(url: {
  readonly searchParams: Pick<URLSearchParams, "get">;
}): string | undefined {
  return url.searchParams.get(TAG_PARAMETER) ?? undefined;
}
