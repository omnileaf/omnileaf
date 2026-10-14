import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.sidebar";
const STORED_HIDDEN = "hidden";
const STORED_SHOWN = "shown";

/** Whether the desktop's sidebar shows its labels or only its icons, kept between launches. */
export class SidebarSetting {
  isHidden = $state(false);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.isHidden = this.#stored.read() === STORED_HIDDEN;
  }

  toggle(): void {
    this.isHidden = !this.isHidden;
    this.#stored.writeIfPossible(this.isHidden ? STORED_HIDDEN : STORED_SHOWN);
  }
}

export function sidebarSettingForDocument(): SidebarSetting {
  return new SidebarSetting(browserPreferenceStore());
}

export const [getSidebarSetting, setSidebarSetting] =
  createContext<SidebarSetting>();
