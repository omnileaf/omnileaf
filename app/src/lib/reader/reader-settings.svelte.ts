import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export type PageLayout = "automatic" | "one" | "two";
export type PageFit = "screen" | "width" | "height";
export type ReaderBackground = "black" | "grey" | "white";
export type ReaderControlsLook = "dark" | "matchApp";
export type SettingsScope = "series" | "all";

export interface ReaderLight {
  readonly isOn: boolean;
  readonly brightness: number;
  readonly warmth: number;
}

export interface ReaderLook {
  readonly layout: PageLayout;
  readonly fit: PageFit;
  readonly background: ReaderBackground;
  readonly controls: ReaderControlsLook;
  readonly light: ReaderLight;
  readonly keepsScreenOn: boolean;
  readonly cropsBorders: boolean;
}

export const PAGE_LAYOUTS: readonly PageLayout[] = ["automatic", "one", "two"];
export const PAGE_FITS: readonly PageFit[] = ["screen", "width", "height"];
export const READER_BACKGROUNDS: readonly ReaderBackground[] = [
  "black",
  "grey",
  "white",
];
export const CONTROLS_LOOKS: readonly ReaderControlsLook[] = [
  "dark",
  "matchApp",
];

export const DEFAULT_LOOK: ReaderLook = {
  layout: "automatic",
  fit: "screen",
  background: "black",
  controls: "dark",
  light: { isOn: false, brightness: 80, warmth: 20 },
  keepsScreenOn: true,
  cropsBorders: false,
};

const ALL_KEY = "omnileaf.readerSettings.all";
const SERIES_KEY_PREFIX = "omnileaf.readerSettings.series.";
const SCOPE_KEY_PREFIX = "omnileaf.readerSettings.scope.";
const PERCENT = { lowest: 0, highest: 100 };

function oneOf<T>(choices: readonly T[], value: unknown): T | undefined {
  return choices.find((choice) => choice === value);
}

function percent(value: unknown): number | undefined {
  return typeof value === "number" &&
    value >= PERCENT.lowest &&
    value <= PERCENT.highest
    ? value
    : undefined;
}

function lightIn(value: unknown): ReaderLight | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { isOn, brightness, warmth } = value as Record<string, unknown>;
  const read = { brightness: percent(brightness), warmth: percent(warmth) };
  return typeof isOn === "boolean" &&
    read.brightness !== undefined &&
    read.warmth !== undefined
    ? { isOn, brightness: read.brightness, warmth: read.warmth }
    : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Keeps only what it understands, so a stored look from another version reads as no change. */
function lookIn(text: string | null): Partial<ReaderLook> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text ?? "{}");
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  const stored = parsed as Record<string, unknown>;
  const read: Partial<Record<keyof ReaderLook, unknown>> = {
    layout: oneOf(PAGE_LAYOUTS, stored.layout),
    fit: oneOf(PAGE_FITS, stored.fit),
    background: oneOf(READER_BACKGROUNDS, stored.background),
    controls: oneOf(CONTROLS_LOOKS, stored.controls),
    light: lightIn(stored.light),
    keepsScreenOn: flag(stored.keepsScreenOn),
    cropsBorders: flag(stored.cropsBorders),
  };
  return Object.fromEntries(
    Object.entries(read).filter(([, value]) => value !== undefined),
  );
}

/** How the reader shows one series' books, set for that series or shared by every series. */
export class ReaderSettings {
  scope: SettingsScope = $state("all");

  #shared: ReaderLook = $state(DEFAULT_LOOK);
  #own: Partial<ReaderLook> = $state({});
  readonly #sharedStored: StoredPreference;
  readonly #ownStored: StoredPreference;
  readonly #scopeStored: StoredPreference;

  constructor(store: PreferenceStore | undefined, series: string) {
    this.#sharedStored = new StoredPreference(store, ALL_KEY);
    this.#ownStored = new StoredPreference(
      store,
      `${SERIES_KEY_PREFIX}${series}`,
    );
    this.#scopeStored = new StoredPreference(
      store,
      `${SCOPE_KEY_PREFIX}${series}`,
    );
    this.#shared = { ...DEFAULT_LOOK, ...lookIn(this.#sharedStored.read()) };
    this.#own = lookIn(this.#ownStored.read());
    this.scope = this.#scopeStored.read() === "series" ? "series" : "all";
  }

  get look(): ReaderLook {
    return this.scope === "series"
      ? { ...this.#shared, ...this.#own }
      : this.#shared;
  }

  change<Key extends keyof ReaderLook>(key: Key, value: ReaderLook[Key]): void {
    if (this.scope === "series") {
      this.#own = { ...this.#own, [key]: value };
      this.#ownStored.writeIfPossible(JSON.stringify(this.#own));
    } else {
      this.#shared = { ...this.#shared, [key]: value };
      this.#sharedStored.writeIfPossible(JSON.stringify(this.#shared));
    }
  }

  applyTo(scope: SettingsScope): void {
    this.scope = scope;
    this.#scopeStored.writeIfPossible(scope);
  }
}

export function readerSettings(series: string): ReaderSettings {
  return new ReaderSettings(browserPreferenceStore(), series);
}
