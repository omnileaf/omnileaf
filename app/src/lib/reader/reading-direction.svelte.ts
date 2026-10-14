import type { ReadingDirection } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export type { ReadingDirection };

export type DirectionChoice = "automatic" | ReadingDirection;

export type PageTurn = "next" | "previous";

const KEY_PREFIX = "omnileaf.readingDirection.";
const DETECTED_KEY_PREFIX = "omnileaf.detectedReadingDirection.";
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

/** What `turn`, as made in a book read left to right, becomes in a book read in `direction`. */
export function inReadingOrder(
  turn: PageTurn,
  direction: ReadingDirection,
): PageTurn {
  return direction === "leftToRight" ? turn : BACKWARD[turn];
}

function parseDirectionChoice(value: string | null): DirectionChoice {
  return DIRECTION_CHOICES.find((choice) => choice === value) ?? "automatic";
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

/** Which way one series reads, as chosen by hand or left to the app, which goes by what its books say. */
export class SeriesReadingDirection {
  choice: DirectionChoice = $state("automatic");

  readonly #stored: StoredPreference;
  readonly #detected: ReadingDirection | undefined;

  constructor(
    store: PreferenceStore | undefined,
    series: string,
    written: ReadingDirection | null,
  ) {
    this.#stored = new StoredPreference(store, `${KEY_PREFIX}${series}`);
    this.choice = parseDirectionChoice(this.#stored.read());
    this.#detected = detectDirection(
      new StoredPreference(store, `${DETECTED_KEY_PREFIX}${series}`),
      written,
    );
  }

  get direction(): ReadingDirection {
    return this.choice === "automatic"
      ? (this.#detected ?? DEFAULT_DIRECTION)
      : this.choice;
  }

  /** Whether the direction left to the app comes from the series' books rather than the default. */
  get isDetected(): boolean {
    return this.choice === "automatic" && this.#detected !== undefined;
  }

  choose(choice: DirectionChoice): void {
    this.choice = choice;
    this.#stored.writeIfPossible(choice);
  }
}

export function seriesReadingDirection(
  series: string,
  written: ReadingDirection | null,
): SeriesReadingDirection {
  return new SeriesReadingDirection(browserPreferenceStore(), series, written);
}
