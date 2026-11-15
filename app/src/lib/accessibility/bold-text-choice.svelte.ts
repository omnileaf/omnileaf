import { commands, type Platform } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const BOLD_TEXT_KEY = "omnileaf.boldText";
const STORED_ON = "on";
const STORED_OFF = "off";

function chosenIn(stored: string | null): boolean | undefined {
  if (stored === STORED_ON) return true;
  if (stored === STORED_OFF) return false;
  return undefined;
}

function markBoldText(isBold: boolean): void {
  const root = document.documentElement;
  if (isBold) {
    root.dataset.boldText = "";
  } else {
    delete root.dataset.boldText;
  }
}

export class BoldTextChoice {
  isBold = $state(false);

  readonly #stored: StoredPreference;
  #chosen: boolean | undefined;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, BOLD_TEXT_KEY);
    this.#chosen = chosenIn(this.#stored.read());
    this.isBold = this.#chosen ?? false;
  }

  followSystem(isSystemBold: boolean): void {
    this.isBold = this.#chosen ?? isSystemBold;
    markBoldText(this.isBold);
  }

  choose(isBold: boolean): void {
    this.#chosen = isBold;
    this.isBold = isBold;
    this.#stored.writeIfPossible(isBold ? STORED_ON : STORED_OFF);
    markBoldText(isBold);
  }
}

export const boldTextChoice = new BoldTextChoice(browserPreferenceStore());

export async function followSystemBoldText(
  platform: Platform,
  readSystem: typeof commands.systemBoldText = commands.systemBoldText,
): Promise<void> {
  if (platform !== "android") {
    boldTextChoice.followSystem(false);
    return;
  }
  const read = await readSystem();
  if (read.status === "error") {
    reportError(read.error);
  }
  boldTextChoice.followSystem(read.status === "ok" && read.data);
}
