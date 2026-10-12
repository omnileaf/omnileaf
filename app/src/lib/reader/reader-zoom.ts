import type { ReaderAction } from "#lib/reader/reader-keys.ts";

const RESTING_SCALE = 1;
/** Leaves room for a scale that settles a hair off where it rests after a pinch out. */
const SCALE_TOLERANCE = 0.01;
const PAGE_TURNS: ReadonlySet<ReaderAction> = new Set(["next", "previous"]);

export function isZoomedIn(scale: number): boolean {
  return scale > RESTING_SCALE + SCALE_TOLERANCE;
}

/** What a tap on a zone does at `scale`: nothing at the page's edges while zoomed in, so a tap ending a pan never turns the page. */
export function zoneAction(
  zone: ReaderAction,
  scale: number,
): ReaderAction | undefined {
  return isZoomedIn(scale) && PAGE_TURNS.has(zone) ? undefined : zone;
}
