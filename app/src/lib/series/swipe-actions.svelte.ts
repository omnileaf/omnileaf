import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

import type { SwipeSide } from "./swipe";

/** What a swipe does to a book; marking read marks a read book unread. */
export type SwipeAction = "markRead" | "nothing";

export const SWIPE_ACTIONS: readonly SwipeAction[] = ["markRead", "nothing"];

const DEFAULTS: Record<SwipeSide, SwipeAction> = {
  towardEnd: "markRead",
  towardStart: "nothing",
};

const KEYS: Record<SwipeSide, string> = {
  towardEnd: "omnileaf.swipeTowardEnd",
  towardStart: "omnileaf.swipeTowardStart",
};

function parseSwipeAction(value: string | null): SwipeAction | undefined {
  return SWIPE_ACTIONS.find((action) => action === value);
}

export class SwipeActionsSetting {
  #chosen: Record<SwipeSide, SwipeAction> = $state({ ...DEFAULTS });

  readonly #stored: Record<SwipeSide, StoredPreference>;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = {
      towardEnd: new StoredPreference(store, KEYS.towardEnd),
      towardStart: new StoredPreference(store, KEYS.towardStart),
    };
    for (const side of ["towardEnd", "towardStart"] as const) {
      this.#chosen[side] =
        parseSwipeAction(this.#stored[side].read()) ?? DEFAULTS[side];
    }
  }

  actionFor(side: SwipeSide): SwipeAction {
    return this.#chosen[side];
  }

  choose(side: SwipeSide, action: SwipeAction): void {
    this.#chosen[side] = action;
    this.#stored[side].writeIfPossible(action);
  }
}

export function swipeActionsSettingForDocument(): SwipeActionsSetting {
  return new SwipeActionsSetting(browserPreferenceStore());
}

export const [getSwipeActionsSetting, setSwipeActionsSetting] =
  createContext<SwipeActionsSetting>();
