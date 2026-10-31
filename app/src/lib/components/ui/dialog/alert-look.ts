import type { Platform } from "#lib/ipc/bindings.ts";

export type AlertAction = "cancel" | "confirm";

export type AlertTone = "danger" | "accent";

const CANCEL_FIRST: readonly AlertAction[] = ["cancel", "confirm"];

const CANCEL_BY_DEFAULT: Readonly<Record<AlertTone, AlertAction>> = {
  danger: "cancel",
  accent: "cancel",
};

export interface AlertLook {
  readonly scrim: string;
  readonly surface: string;
  readonly badge: string;
  readonly title: string;
  readonly body: string;
  readonly description: string;
  readonly actions: string;
  readonly cancel: string;
  readonly confirm: string;
  readonly actionOrder: readonly AlertAction[];
  readonly defaultAction: Readonly<Record<AlertTone, AlertAction>>;
}

export const CONTENT_DIALOG_PANEL =
  "inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-dialog px-sheet-inline py-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit";

export const TODAYS_ALERT_LOOK: AlertLook = {
  scrim: "",
  surface: "",
  badge: "",
  title: "",
  body: "",
  description: "",
  actions: "",
  cancel: "",
  confirm: "",
  actionOrder: CANCEL_FIRST,
  defaultAction: CANCEL_BY_DEFAULT,
};

const IOS_ACTION =
  "ios:max-medium:rounded-full max-medium:bg-native-button-secondary max-medium:text-native-row-title max-medium:font-semibold max-medium:min-block-native-dialog-button max-medium:hover:bg-native-button-secondary max-medium:active:bg-native-button-secondary max-medium:active:tint-native-button-secondary-pressed";

const IOS_LOOK: AlertLook = {
  scrim: "max-medium:bg-native-scrim",
  surface:
    "max-medium:inline-native-dialog max-medium:gap-none max-medium:border-none max-medium:p-lg max-medium:rounded-native-dialog max-medium:bg-native-dialog max-medium:backdrop-blur-glass max-medium:backdrop-saturate-180",
  badge: "max-medium:hidden",
  title:
    "max-medium:pbs-sm max-medium:px-native-dialog-text-inline max-medium:text-native-row-title max-medium:font-semibold",
  body: "max-medium:gap-none",
  description:
    "max-medium:pbs-native-dialog-text-gap max-medium:px-native-dialog-text-inline",
  actions: "max-medium:mbs-xl",
  cancel: `${IOS_ACTION} max-medium:text-foreground`,
  confirm: `${IOS_ACTION} max-medium:text-danger`,
  actionOrder: CANCEL_FIRST,
  defaultAction: CANCEL_BY_DEFAULT,
};

/** WinUI guidance makes the safe button a ContentDialog's DefaultButton when its action destroys something. */
const WINDOWS_DEFAULT_BUTTON: Readonly<Record<AlertTone, AlertAction>> = {
  danger: "cancel",
  accent: "confirm",
};

const WINDOWS_LOOK: AlertLook = {
  scrim: "bg-native-scrim",
  surface:
    "gap-md rounded-native-dialog border-native-dialog-edge bg-native-dialog bg-linear-to-b from-native-dialog-layer to-native-dialog-layer p-xl inline-native-dialog shadow-native-dialog-lift",
  badge: "hidden",
  title: "text-title font-semibold max-medium:text-title",
  body: "-mx-xl -mbe-xl gap-md px-xl pbe-none",
  description: "",
  actions:
    "-mx-xl mbs-md gap-sm border-bs border-native-dialog-band-edge bg-native-dialog p-xl",
  cancel: "",
  confirm:
    "bg-native-button-primary text-native-on-button-primary aria-disabled:border-transparent aria-disabled:bg-native-button-primary-disabled aria-disabled:text-native-on-button-primary-disabled",
  actionOrder: ["confirm", "cancel"],
  defaultAction: WINDOWS_DEFAULT_BUTTON,
};

const ANDROID_TEXT_BUTTON =
  "max-medium:bg-transparent max-medium:px-md max-medium:text-native-on-button-plain max-medium:shadow-none max-medium:hover:bg-native-button-plain-hover max-medium:active:bg-native-button-plain-pressed";

const ANDROID_LOOK: AlertLook = {
  scrim: "max-medium:bg-native-scrim",
  surface:
    "max-medium:gap-none max-medium:rounded-native-dialog max-medium:border-none max-medium:p-xl",
  badge: "max-medium:hidden",
  title:
    "max-medium:pbe-lg max-medium:text-native-large-title/native-large-title max-medium:font-native-large-title max-medium:tracking-native-large-title",
  body: "max-medium:gap-xl",
  description:
    "max-medium:text-muted max-medium:text-native-row-subtitle/native-row-subtitle",
  actions: "max-medium:flex max-medium:justify-end max-medium:gap-sm",
  cancel: ANDROID_TEXT_BUTTON,
  confirm: ANDROID_TEXT_BUTTON,
  actionOrder: CANCEL_FIRST,
  defaultAction: CANCEL_BY_DEFAULT,
};

const ALERT_LOOKS = {
  ios: IOS_LOOK,
  android: ANDROID_LOOK,
  linux: TODAYS_ALERT_LOOK,
  macos: TODAYS_ALERT_LOOK,
  windows: WINDOWS_LOOK,
} satisfies Record<Platform, AlertLook>;

export type ConfirmPhoneLook = "sheet" | "dialog";

/** WinUI has no bottom sheets, so a Windows confirmation is always a ContentDialog. */
const HAS_BOTTOM_SHEETS = {
  ios: true,
  android: true,
  linux: true,
  macos: true,
  windows: false,
} satisfies Record<Platform, boolean>;

export function opensAsAlert(
  platform: Platform,
  phoneLook: ConfirmPhoneLook,
): boolean {
  return phoneLook === "dialog" || !HAS_BOTTOM_SHEETS[platform];
}

export function alertLook(platform: Platform): AlertLook {
  return ALERT_LOOKS[platform];
}
