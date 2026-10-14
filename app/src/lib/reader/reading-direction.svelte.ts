import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export type ReadingDirection = "leftToRight" | "rightToLeft";

export type DirectionChoice = "automatic" | ReadingDirection;

export type PageTurn = "next" | "previous";

const KEY_PREFIX = "omnileaf.readingDirection.";
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

/** Which way one series reads, as chosen by hand or left to the app. */
export class SeriesReadingDirection {
  choice: DirectionChoice = $state("automatic");

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined, series: string) {
    this.#stored = new StoredPreference(store, `${KEY_PREFIX}${series}`);
    this.choice = parseDirectionChoice(this.#stored.read());
  }

  /** Reads left to right while the choice is left to the app, until it learns to tell from the book. */
  get direction(): ReadingDirection {
    return this.choice === "automatic" ? "leftToRight" : this.choice;
  }

  choose(choice: DirectionChoice): void {
    this.choice = choice;
    this.#stored.writeIfPossible(choice);
  }
}

export function seriesReadingDirection(series: string): SeriesReadingDirection {
  return new SeriesReadingDirection(browserPreferenceStore(), series);
}
