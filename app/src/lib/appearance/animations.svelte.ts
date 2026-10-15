import { createContext } from "svelte";
import { SvelteSet } from "svelte/reactivity";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export const ANIMATIONS_PREFERENCE_KEY = "omnileaf.animationsStill";

export const ANIMATION_GROUPS = [
  "navigation",
  "sheets",
  "reader",
  "loading",
] as const;

export type AnimationGroup = (typeof ANIMATION_GROUPS)[number];

function isGroup(word: string): word is AnimationGroup {
  return ANIMATION_GROUPS.some((group) => group === word);
}

/** Which groups of the app's movement play: every one until turned off, the ones held still named on the document for the styles to read. */
export class AnimationsSetting {
  readonly #still: SvelteSet<AnimationGroup>;
  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, ANIMATIONS_PREFERENCE_KEY);
    this.#still = new SvelteSet(this.#storedGroups());
  }

  reread(): void {
    this.#still.clear();
    for (const group of this.#storedGroups()) {
      this.#still.add(group);
    }
  }

  get stillGroups(): string {
    return ANIMATION_GROUPS.filter((group) => this.#still.has(group)).join(" ");
  }

  isOn(group: AnimationGroup): boolean {
    return !this.#still.has(group);
  }

  #storedGroups(): AnimationGroup[] {
    return (this.#stored.read() ?? "").split(" ").filter(isGroup);
  }

  turn(group: AnimationGroup, isOn: boolean): void {
    if (isOn) {
      this.#still.delete(group);
    } else {
      this.#still.add(group);
    }
    this.#stored.writeIfPossible(this.stillGroups);
  }
}

export function animationsSettingForDocument(): AnimationsSetting {
  return new AnimationsSetting(browserPreferenceStore());
}

export const [getAnimationsSetting, setAnimationsSetting] =
  createContext<AnimationsSetting>();
