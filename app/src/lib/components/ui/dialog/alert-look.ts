import type { Platform } from "#lib/ipc/bindings.ts";

export interface AlertLook {
  readonly surface: string;
  readonly badge: string;
  readonly title: string;
  readonly body: string;
  readonly description: string;
  readonly actions: string;
  readonly cancel: string;
  readonly confirm: string;
}

export const TODAYS_ALERT_LOOK: AlertLook = {
  surface: "",
  badge: "",
  title: "",
  body: "",
  description: "",
  actions: "",
  cancel: "",
  confirm: "",
};

const IOS_ACTION =
  "ios:max-medium:rounded-full max-medium:bg-native-button-secondary max-medium:text-native-row-title max-medium:font-semibold max-medium:min-block-native-dialog-button max-medium:hover:bg-native-button-secondary max-medium:active:tint-native-button-secondary-pressed";

const IOS_LOOK: AlertLook = {
  surface:
    "max-medium:inline-native-dialog max-medium:max-inline-full max-medium:gap-none max-medium:border-none max-medium:p-lg max-medium:rounded-native-dialog max-medium:bg-native-dialog max-medium:backdrop-blur-glass max-medium:backdrop-saturate-180",
  badge: "max-medium:hidden",
  title:
    "max-medium:pbs-sm max-medium:px-native-dialog-text-inline max-medium:text-native-row-title max-medium:font-semibold",
  body: "max-medium:gap-none",
  description:
    "max-medium:pbs-native-dialog-text-gap max-medium:px-native-dialog-text-inline",
  actions: "max-medium:mbs-xl",
  cancel: `${IOS_ACTION} max-medium:text-foreground`,
  confirm: `${IOS_ACTION} max-medium:text-danger`,
};

const ALERT_LOOKS = {
  ios: IOS_LOOK,
  android: TODAYS_ALERT_LOOK,
  linux: TODAYS_ALERT_LOOK,
  macos: TODAYS_ALERT_LOOK,
  windows: TODAYS_ALERT_LOOK,
} satisfies Record<Platform, AlertLook>;

export function alertLook(platform: Platform): AlertLook {
  return ALERT_LOOKS[platform];
}
