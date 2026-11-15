import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export const LONG_PRESSES = ["short", "medium", "long"] as const;

export type LongPressLength = (typeof LONG_PRESSES)[number];

const LONG_PRESS_MS = {
  short: 300,
  medium: 500,
  long: 800,
} satisfies Record<LongPressLength, number>;

const DEFAULT_LONG_PRESS: LongPressLength = "medium";
const LARGER_TARGETS_KEY = "omnileaf.largerTapTargets";
const LONG_PRESS_KEY = "omnileaf.longPress";
const STORED_ON = "on";
const STORED_OFF = "off";
const LARGER_TARGETS_MARK = "larger";

function longPressIn(stored: string | null): LongPressLength {
  return LONG_PRESSES.find((length) => length === stored) ?? DEFAULT_LONG_PRESS;
}

function markTargets(hasLargerTargets: boolean): void {
  const root = document.documentElement;
  if (hasLargerTargets) {
    root.dataset.tapTargets = LARGER_TARGETS_MARK;
  } else {
    delete root.dataset.tapTargets;
  }
}

export class TouchChoices {
  hasLargerTargets = $state(false);
  longPress: LongPressLength = $state(DEFAULT_LONG_PRESS);

  readonly #largerTargets: StoredPreference;
  readonly #longPress: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#largerTargets = new StoredPreference(store, LARGER_TARGETS_KEY);
    this.#longPress = new StoredPreference(store, LONG_PRESS_KEY);
    this.hasLargerTargets = this.#largerTargets.read() === STORED_ON;
    this.longPress = longPressIn(this.#longPress.read());
  }

  get longPressMs(): number {
    return LONG_PRESS_MS[this.longPress];
  }

  markDocument(): void {
    markTargets(this.hasLargerTargets);
  }

  chooseLargerTargets(isLarger: boolean): void {
    this.hasLargerTargets = isLarger;
    this.#largerTargets.writeIfPossible(isLarger ? STORED_ON : STORED_OFF);
    markTargets(isLarger);
  }

  chooseLongPress(length: LongPressLength): void {
    this.longPress = length;
    this.#longPress.writeIfPossible(length);
  }
}

export const touchChoices = new TouchChoices(browserPreferenceStore());
