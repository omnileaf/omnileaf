import { wayUp } from "./up-history";

export const ENTRIES_KEPT_BEHIND = 3;

export interface ShownScreen {
  readonly pathname: string;
  readonly entries: readonly string[];
  readonly backPath: string | undefined;
}

function entriesBehind(
  pathname: string,
  entries: readonly string[],
): readonly string[] {
  const shownAt = entries.lastIndexOf(pathname);
  return shownAt === -1
    ? []
    : entries.slice(Math.max(0, shownAt - ENTRIES_KEPT_BEHIND), shownAt);
}

export function waysBackFrom({
  pathname,
  entries,
  backPath,
}: ShownScreen): ReadonlySet<string> {
  const ways = new Set([
    ...wayUp(pathname),
    ...entriesBehind(pathname, entries),
    ...(backPath === undefined ? [] : [backPath]),
  ]);
  ways.delete(pathname);
  return ways;
}

export function entryBehind(
  pathname: string,
  entries: readonly string[],
): string | undefined {
  return entriesBehind(pathname, entries).at(-1);
}
