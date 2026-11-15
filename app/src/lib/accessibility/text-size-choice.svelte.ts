import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export const TEXT_SIZES = ["system", "larger", "largest"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

const SYSTEM_SIZE: TextSize = "system";
const TEXT_SIZE_KEY = "omnileaf.textSize";

function textSizeIn(stored: string | null): TextSize {
  return TEXT_SIZES.find((size) => size === stored) ?? SYSTEM_SIZE;
}

function markTextSize(size: TextSize): void {
  const root = document.documentElement;
  if (size === SYSTEM_SIZE) {
    delete root.dataset.textSize;
  } else {
    root.dataset.textSize = size;
  }
}

export class TextSizeChoice {
  size: TextSize = $state(SYSTEM_SIZE);

  readonly #size: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#size = new StoredPreference(store, TEXT_SIZE_KEY);
    this.size = textSizeIn(this.#size.read());
  }

  markDocument(): void {
    markTextSize(this.size);
  }

  choose(size: TextSize): void {
    this.size = size;
    this.#size.writeIfPossible(size);
    markTextSize(size);
  }
}

export const textSizeChoice = new TextSizeChoice(browserPreferenceStore());
