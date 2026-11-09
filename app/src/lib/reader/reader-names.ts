import { m } from "#lib/paraglide/messages.js";
import type { ReadingModeChoice } from "#lib/reader/reading-direction.svelte.ts";
import type { TapZones } from "#lib/reader/reader-settings.svelte.ts";

export const READING_MODE_NAMES = {
  automatic: m.reader_direction_automatic,
  leftToRight: m.reader_left_to_right,
  rightToLeft: m.reader_right_to_left,
  longStrip: m.reader_long_strip,
} satisfies Record<ReadingModeChoice, () => string>;

export const TAP_ZONE_NAMES = {
  edges: m.reader_tap_zones_edges,
  lShape: m.reader_tap_zones_l,
  off: m.reader_tap_zones_off,
} satisfies Record<TapZones, () => string>;
