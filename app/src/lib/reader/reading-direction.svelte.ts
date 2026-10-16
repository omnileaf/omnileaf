import type { ReadingDirection } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export type { ReadingDirection };

export type DirectionChoice = "automatic" | ReadingDirection;
export type ReadingModeChoice = DirectionChoice | "longStrip";
export type ReadingMode = "paged" | "longStrip";

export type PageTurn = "next" | "previous";

const KEY_PREFIX = "omnileaf.readingDirection.";
const DETECTED_KEY_PREFIX = "omnileaf.detectedReadingDirection.";
const STRIP_KEY_PREFIX = "omnileaf.detectedStrip.";
const STORED_STRIP = "strip";
const STORED_PAGED = "paged";
const DEFAULT_DIRECTION: ReadingDirection = "leftToRight";
const BACKWARD: Record<PageTurn, PageTurn> = {
  next: "previous",
  previous: "next",
};

export const DIRECTION_CHOICES: readonly DirectionChoice[] = [
  "automatic",
  "leftToRight",
  "rightToLeft",
];
export const READING_MODE_CHOICES: readonly ReadingModeChoice[] = [
  ...DIRECTION_CHOICES,
  "longStrip",
];

/** What `turn`, as made in a book read left to right, becomes in a book read in `direction`. */
export function inReadingOrder(
  turn: PageTurn,
  direction: ReadingDirection,
): PageTurn {
  return direction === "leftToRight" ? turn : BACKWARD[turn];
}

function parseChoice(value: string | null): ReadingModeChoice {
  return READING_MODE_CHOICES.find((choice) => choice === value) ?? "automatic";
}

function parseDirection(value: string | null): ReadingDirection | undefined {
  return value === "leftToRight" || value === "rightToLeft" ? value : undefined;
}

/** The direction a series' book says it reads in, else the one an earlier book of the series said. */
function detectDirection(
  stored: StoredPreference,
  written: ReadingDirection | null,
): ReadingDirection | undefined {
  if (written === null) {
    return parseDirection(stored.read());
  }
  stored.writeIfPossible(written);
  return written;
}

/** Whether a series' book looks like a long strip, else whether an earlier book of the series did. */
function detectStrip(stored: StoredPreference, seen: boolean | null): boolean {
  if (seen === null) {
    return stored.read() === STORED_STRIP;
  }
  stored.writeIfPossible(seen ? STORED_STRIP : STORED_PAGED);
  return seen;
}

/** Which way one series reads, as chosen by hand or left to the app, which goes by what its books say. */
export class SeriesReadingDirection {
  choice: ReadingModeChoice = $state("automatic");

  readonly #stored: StoredPreference;
  readonly #detected: ReadingDirection | undefined;
  readonly #looksLikeStrip: boolean;

  constructor(
    store: PreferenceStore | undefined,
    series: string,
    written: ReadingDirection | null,
    seenAsStrip: boolean | null,
  ) {
    this.#stored = new StoredPreference(store, `${KEY_PREFIX}${series}`);
    this.choice = parseChoice(this.#stored.read());
    this.#detected = detectDirection(
      new StoredPreference(store, `${DETECTED_KEY_PREFIX}${series}`),
      written,
    );
    this.#looksLikeStrip = detectStrip(
      new StoredPreference(store, `${STRIP_KEY_PREFIX}${series}`),
      seenAsStrip,
    );
  }

  get direction(): ReadingDirection {
    return this.choice === "leftToRight" || this.choice === "rightToLeft"
      ? this.choice
      : (this.#detected ?? DEFAULT_DIRECTION);
  }

  get mode(): ReadingMode {
    return this.choice === "longStrip" || this.isStripDetected
      ? "longStrip"
      : "paged";
  }

  /** Whether the app reads the series as a long strip because its pages look like one. */
  get isStripDetected(): boolean {
    return this.choice === "automatic" && this.#looksLikeStrip;
  }

  /** Whether the direction left to the app comes from the series' books rather than the default. */
  get isDetected(): boolean {
    return this.choice === "automatic" && this.#detected !== undefined;
  }

  choose(choice: ReadingModeChoice): void {
    this.choice = choice;
    this.#stored.writeIfPossible(choice);
  }
}

export function seriesReadingDirection(
  series: string,
  written: ReadingDirection | null,
  seenAsStrip: boolean | null,
): SeriesReadingDirection {
  return new SeriesReadingDirection(
    browserPreferenceStore(),
    series,
    written,
    seenAsStrip,
  );
}
