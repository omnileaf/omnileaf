export const SCREENSHOT_MODE_OPTIONS = [
  "blankReaderPages",
  "showLabel",
  "turnOffAfterAnHour",
] as const;

export type ScreenshotModeOption = (typeof SCREENSHOT_MODE_OPTIONS)[number];

export type ScreenshotModeOptions = Readonly<
  Record<ScreenshotModeOption, boolean>
>;

export type ScreenshotModeActivity =
  | { readonly kind: "off" }
  | { readonly kind: "on" }
  | { readonly kind: "onUntil"; readonly turnsOffAt: number };

export interface ScreenshotModeSettings {
  readonly activity: ScreenshotModeActivity;
  readonly options: ScreenshotModeOptions;
}

export interface OptionChoice {
  readonly option: ScreenshotModeOption;
  readonly isChosen: boolean;
}

export const AUTO_OFF_DELAY_MS = 60 * 60 * 1000;

export const DEFAULT_SCREENSHOT_MODE: ScreenshotModeSettings = {
  activity: { kind: "off" },
  options: {
    blankReaderPages: true,
    showLabel: true,
    turnOffAfterAnHour: true,
  },
};

function activityFrom(
  options: ScreenshotModeOptions,
  now: number,
): ScreenshotModeActivity {
  return options.turnOffAfterAnHour
    ? { kind: "onUntil", turnsOffAt: now + AUTO_OFF_DELAY_MS }
    : { kind: "on" };
}

export function turnOn(
  settings: ScreenshotModeSettings,
  now: number,
): ScreenshotModeSettings {
  return { ...settings, activity: activityFrom(settings.options, now) };
}

export function turnOff(
  settings: ScreenshotModeSettings,
): ScreenshotModeSettings {
  return { ...settings, activity: { kind: "off" } };
}

export function chooseOption(
  settings: ScreenshotModeSettings,
  { option, isChosen }: OptionChoice,
  now: number,
): ScreenshotModeSettings {
  const options = { ...settings.options, [option]: isChosen };
  const isDeadlineChanged =
    option === "turnOffAfterAnHour" && settings.activity.kind !== "off";
  return {
    options,
    activity: isDeadlineChanged
      ? activityFrom(options, now)
      : settings.activity,
  };
}

export function settle(
  settings: ScreenshotModeSettings,
  now: number,
): ScreenshotModeSettings {
  const { activity } = settings;
  return activity.kind === "onUntil" && activity.turnsOffAt <= now
    ? turnOff(settings)
    : settings;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseActivity(value: unknown): ScreenshotModeActivity {
  if (!isRecord(value)) {
    return DEFAULT_SCREENSHOT_MODE.activity;
  }
  if (value.kind === "on") {
    return { kind: "on" };
  }
  if (value.kind === "onUntil" && isTime(value.turnsOffAt)) {
    return { kind: "onUntil", turnsOffAt: value.turnsOffAt };
  }
  return DEFAULT_SCREENSHOT_MODE.activity;
}

function parseOptions(value: unknown): ScreenshotModeOptions {
  const stored = isRecord(value) ? value : {};
  const chosenOrDefault = (option: ScreenshotModeOption): boolean => {
    const chosen = stored[option];
    return typeof chosen === "boolean"
      ? chosen
      : DEFAULT_SCREENSHOT_MODE.options[option];
  };
  return {
    blankReaderPages: chosenOrDefault("blankReaderPages"),
    showLabel: chosenOrDefault("showLabel"),
    turnOffAfterAnHour: chosenOrDefault("turnOffAfterAnHour"),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseScreenshotModeSettings(
  stored: string | null,
): ScreenshotModeSettings {
  const value = stored === null ? undefined : parseJson(stored);
  if (!isRecord(value)) {
    return DEFAULT_SCREENSHOT_MODE;
  }
  return {
    activity: parseActivity(value.activity),
    options: parseOptions(value.options),
  };
}
