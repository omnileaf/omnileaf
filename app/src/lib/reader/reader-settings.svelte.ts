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
export type TapZones = "edges" | "lShape" | "off";
export type PageTurnStyle = "instant" | "slide";
export type TapToScroll = "topAndBottom" | "off";
export type AutoScrollChoice = "myPace" | "set";

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
  readonly turnsPagesWithVolumeKeys: boolean;
  readonly tapZones: TapZones;
  readonly pageTurn: PageTurnStyle;
  readonly tapToScroll: TapToScroll;
  readonly autoScrollSpeed: AutoScrollChoice;
  readonly screensPerMinute: number;
  readonly pausesAtEnd: boolean;
}

type ScopedLookKey = Exclude<keyof ReaderLook, "screensPerMinute">;

export const PAGE_LAYOUTS: readonly PageLayout[] = ["automatic", "one", "two"];
export const PAGE_FITS: readonly PageFit[] = ["screen", "width", "height"];
export const READER_BACKGROUNDS: readonly ReaderBackground[] = [
  "black",
  "grey",
  "white",
];
export const TAP_ZONES: readonly TapZones[] = ["edges", "lShape", "off"];
export const PAGE_TURN_STYLES: readonly PageTurnStyle[] = ["instant", "slide"];
export const TAP_TO_SCROLL: readonly TapToScroll[] = ["topAndBottom", "off"];
export const AUTO_SCROLL_CHOICES: readonly AutoScrollChoice[] = [
  "myPace",
  "set",
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
  turnsPagesWithVolumeKeys: false,
  tapZones: "edges",
  pageTurn: "instant",
  tapToScroll: "topAndBottom",
  autoScrollSpeed: "myPace",
  screensPerMinute: 3,
  pausesAtEnd: true,
};

const ALL_KEY = "omnileaf.readerSettings.all";
const SERIES_KEY_PREFIX = "omnileaf.readerSettings.series.";
const SCOPE_KEY_PREFIX = "omnileaf.readerSettings.scope.";
const SPEED_SAVED_FOR_KEY_PREFIX = "omnileaf.readerSettings.speedSavedFor.";
const PERCENT = { lowest: 0, highest: 100 };
export const SCREENS_PER_MINUTE = { slowest: 1, fastest: 12, step: 1 } as const;

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

function screensPerMinute(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(
      (value - SCREENS_PER_MINUTE.slowest) / SCREENS_PER_MINUTE.step,
    ) &&
    value >= SCREENS_PER_MINUTE.slowest &&
    value <= SCREENS_PER_MINUTE.fastest
    ? value
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
    turnsPagesWithVolumeKeys: flag(stored.turnsPagesWithVolumeKeys),
    tapZones: oneOf(TAP_ZONES, stored.tapZones),
    pageTurn: oneOf(PAGE_TURN_STYLES, stored.pageTurn),
    tapToScroll: oneOf(TAP_TO_SCROLL, stored.tapToScroll),
    autoScrollSpeed: oneOf(AUTO_SCROLL_CHOICES, stored.autoScrollSpeed),
    screensPerMinute: screensPerMinute(stored.screensPerMinute),
    pausesAtEnd: flag(stored.pausesAtEnd),
  };
  return Object.fromEntries(
    Object.entries(read).filter(([, value]) => value !== undefined),
  );
}

/** How the reader shows one series' books, set for that series or shared by every series. */
export class ReaderSettings {
  scope: SettingsScope = $state("all");
  speedSavedFor: SettingsScope = $state("series");

  #shared: ReaderLook = $state(DEFAULT_LOOK);
  #own: Partial<ReaderLook> = $state({});
  readonly #sharedStored: StoredPreference;
  readonly #ownStored: StoredPreference;
  readonly #scopeStored: StoredPreference;
  readonly #speedSavedForStored: StoredPreference;

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
    this.#speedSavedForStored = new StoredPreference(
      store,
      `${SPEED_SAVED_FOR_KEY_PREFIX}${series}`,
    );
    this.#shared = { ...DEFAULT_LOOK, ...lookIn(this.#sharedStored.read()) };
    this.#own = lookIn(this.#ownStored.read());
    this.scope = this.#scopeStored.read() === "series" ? "series" : "all";
    this.speedSavedFor =
      this.#speedSavedForStored.read() === "all" ? "all" : "series";
  }

  get look(): ReaderLook {
    const look =
      this.scope === "series"
        ? { ...this.#shared, ...this.#own }
        : this.#shared;
    return { ...look, screensPerMinute: this.speed };
  }

  change<Key extends ScopedLookKey>(key: Key, value: ReaderLook[Key]): void {
    if (this.scope === "series") {
      this.#keepOwn({ ...this.#own, [key]: value });
    } else {
      this.#keepShared({ ...this.#shared, [key]: value });
    }
  }

  applyTo(scope: SettingsScope): void {
    this.scope = scope;
    this.#scopeStored.writeIfPossible(scope);
  }

  get speed(): number {
    return this.#own.screensPerMinute ?? this.#shared.screensPerMinute;
  }

  get defaultSpeed(): number {
    return this.#shared.screensPerMinute;
  }

  saveSpeedFor(scope: SettingsScope): void {
    this.speedSavedFor = scope;
    this.#speedSavedForStored.writeIfPossible(scope);
    this.changeSpeed(this.speed);
  }

  changeSpeed(screensPerMinute: number): void {
    if (this.speedSavedFor === "series") {
      this.#keepOwn({ ...this.#own, screensPerMinute });
    } else {
      this.#keepShared({ ...this.#shared, screensPerMinute });
      this.useDefaultSpeed();
    }
  }

  useDefaultSpeed(): void {
    if (this.#own.screensPerMinute === undefined) {
      return;
    }
    const own = { ...this.#own };
    delete own.screensPerMinute;
    this.#keepOwn(own);
  }

  #keepOwn(own: Partial<ReaderLook>): void {
    this.#own = own;
    this.#ownStored.writeIfPossible(JSON.stringify(own));
  }

  #keepShared(shared: ReaderLook): void {
    this.#shared = shared;
    this.#sharedStored.writeIfPossible(JSON.stringify(shared));
  }
}

/** The look every series starts with until it's given its own, as Settings › Reader sets it. */
export class ReaderDefaults {
  #look: ReaderLook = $state(DEFAULT_LOOK);
  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, ALL_KEY);
    this.#look = { ...DEFAULT_LOOK, ...lookIn(this.#stored.read()) };
  }

  get look(): ReaderLook {
    return this.#look;
  }

  change<Key extends keyof ReaderLook>(key: Key, value: ReaderLook[Key]): void {
    this.#look = { ...this.#look, [key]: value };
    this.#stored.writeIfPossible(JSON.stringify(this.#look));
  }
}

export function readerDefaults(): ReaderDefaults {
  return new ReaderDefaults(browserPreferenceStore());
}

export function readerSettings(series: string): ReaderSettings {
  return new ReaderSettings(browserPreferenceStore(), series);
}
