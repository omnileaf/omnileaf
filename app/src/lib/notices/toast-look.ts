import type { Platform } from "#lib/ipc/bindings.ts";

export interface ToastLook {
  readonly card: string;
  readonly oneLineCard: string;
  readonly tallCard: string;
  readonly oneLineWords: string;
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly action: string;
  readonly warningAction: string;
}

const WARNING_ACTION =
  "bg-on-warning px-lg text-label font-medium text-warning-soft min-block-touch-target android:medium:font-semibold desktop:rounded-toast-action desktop:px-sm desktop:text-caption desktop:min-block-xl";

const TODAYS_LOOK: ToastLook = {
  card: "",
  oneLineCard: "",
  tallCard: "",
  oneLineWords: "",
  icon: "",
  title: "",
  body: "",
  action: "",
  warningAction: WARNING_ACTION,
};

const NATIVE_ACTION =
  "max-medium:native-target max-medium:rounded-full max-medium:border-0 max-medium:bg-native-notice-action max-medium:px-native-notice-action-inline max-medium:text-native-notice-label max-medium:leading-native-notice-label max-medium:font-native-notice-label max-medium:tracking-native-notice-label max-medium:text-native-on-notice-action max-medium:min-block-native-notice-action";

const NATIVE_LOOK: ToastLook = {
  card: "max-medium:border-0 max-medium:bg-native-notice max-medium:ps-native-notice-start max-medium:pe-native-notice-end max-medium:text-native-on-notice max-medium:shadow-native-notice-lift max-medium:min-block-native-notice",
  oneLineCard:
    "max-medium:rounded-native-notice max-medium:py-native-notice-block",
  tallCard:
    "max-medium:rounded-native-notice-tall max-medium:py-native-notice-tall-block",
  oneLineWords: "max-medium:py-native-notice-one-line-words-block",
  icon: "",
  title:
    "max-medium:text-native-notice-title max-medium:leading-native-notice-title max-medium:font-native-notice-title max-medium:tracking-native-notice-title",
  body: "max-medium:text-native-notice-body max-medium:leading-native-notice-body max-medium:font-native-notice-body max-medium:tracking-native-notice-body max-medium:text-native-on-notice",
  action: NATIVE_ACTION,
  warningAction: `${WARNING_ACTION} ${NATIVE_ACTION}`,
};

const TOAST_LOOKS = {
  ios: {
    ...NATIVE_LOOK,
    card: `${NATIVE_LOOK.card} max-medium:backdrop-blur-glass max-medium:backdrop-saturate-180`,
  },
  android: { ...NATIVE_LOOK, icon: "max-medium:hidden" },
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, ToastLook>;

export function toastLook(platform: Platform): ToastLook {
  return TOAST_LOOKS[platform];
}
