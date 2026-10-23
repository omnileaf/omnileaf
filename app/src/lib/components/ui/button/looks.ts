import type { Platform } from "#lib/ipc/bindings.ts";

const FOCUS_RING = "focus-visible:focus-ring";

const CONFIRM =
  "rounded-full px-lg text-body font-semibold transition-control min-block-touch-button ios:max-medium:rounded-ios-button medium:rounded-shadcn-button medium:text-label medium:font-medium medium:min-block-shadcn-button linux:medium:shadow-raised macos:shadow-raised";

const DIALOG_BUTTON =
  "rounded-shadcn-button px-lg font-medium transition-control min-block-shadcn-button ios:max-medium:rounded-ios-button ios:max-medium:font-semibold medium:text-label linux:shadow-raised macos:shadow-raised";

const SHADCN_BUTTON =
  "rounded-shadcn-button px-lg py-sm text-label font-medium transition-control min-block-shadcn-button macos:py-none windows:py-none linux:shadow-raised macos:shadow-raised";

const OUTLINED =
  "border border-button-outline-edge bg-button-outline windows:border-be-windows-stroke-strong";

export const BUTTON_LOOKS = {
  text: `font-medium text-foreground android:text-accent ios:font-semibold ${FOCUS_RING}`,
  quiet: `font-semibold text-accent transition-control enabled:hover:bg-hover enabled:active:bg-pressed ${FOCUS_RING}`,
  primary: `bg-accent text-on-accent transition-control enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed ${FOCUS_RING}`,
  filled: `bg-accent text-on-accent ${FOCUS_RING}`,
  outline: `rounded-control border border-border bg-card font-semibold ${FOCUS_RING}`,
  tinted: `transition-control enabled:hover:tint-hover enabled:active:tint-pressed ${FOCUS_RING}`,
  icon: `flex items-center justify-center rounded-full ${FOCUS_RING}`,
  "header-control": `flex items-center justify-center gap-sm rounded-full transition-control large:rounded-shadcn-button large:border large:border-button-outline-edge large:bg-button-outline large:text-small large:font-medium large:block-shadcn-control windows:large:border-be-windows-stroke-strong linux:large:shadow-raised macos:large:shadow-raised ${FOCUS_RING}`,
  chip: `rounded-full border border-border bg-card font-semibold hover:bg-hover ${FOCUS_RING}`,
  "bar-icon": `flex items-center justify-center gap-xs rounded-control text-foreground transition-control enabled:hover:bg-hover enabled:active:bg-pressed ${FOCUS_RING}`,
  row: "flex items-center text-start transition-control hover:bg-hover active:bg-pressed",
  inverse: `rounded-full bg-accent font-medium text-on-accent transition-control hover:opacity-85 active:opacity-70 android:font-semibold ${FOCUS_RING}`,
  dismiss: `isolate flex items-center justify-center rounded-full opacity-70 transition-control before:absolute before:z-behind before:rounded-full before:transition-control hover:opacity-100 hover:before:bg-hover active:opacity-100 active:before:bg-pressed ${FOCUS_RING}`,
  "row-action": `isolate flex items-center justify-center rounded-full text-foreground transition-control before:absolute before:z-behind before:rounded-full before:transition-control enabled:hover:before:bg-hover enabled:active:before:bg-pressed disabled:opacity-60 ${FOCUS_RING}`,
  "about-copy": `flex shrink-0 items-center justify-center rounded-full text-muted transition-control block-touch-target inline-touch-target hover:bg-hover hover:text-foreground active:bg-pressed desktop:rounded-control desktop:block-pointer-button desktop:inline-pointer-button ${FOCUS_RING}`,
  "confirm-cancel": `${CONFIRM} bg-chip hover:tint-hover active:tint-pressed medium:border medium:border-button-outline-edge medium:bg-button-outline windows:medium:border-be-windows-stroke-strong ${FOCUS_RING}`,
  "confirm-danger": `${CONFIRM} bg-danger-fill text-on-danger hover:bg-danger-hover active:bg-danger-pressed ${FOCUS_RING}`,
  "crash-phone-primary": `rounded-full bg-accent text-callout font-bold text-on-accent min-block-crash-screen-button ios:rounded-crash-screen-button ${FOCUS_RING}`,
  "crash-phone-secondary": `rounded-full border border-quiet-edge text-callout font-bold min-block-crash-screen-button ios:rounded-crash-screen-button ${FOCUS_RING}`,
  "dialog-secondary": `${DIALOG_BUTTON} ${OUTLINED} enabled:hover:tint-hover enabled:active:tint-pressed ${FOCUS_RING}`,
  "dialog-primary": `${DIALOG_BUTTON} bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed ${FOCUS_RING}`,
  "card-outline": `${SHADCN_BUTTON} ${OUTLINED} enabled:hover:tint-hover enabled:active:tint-pressed ${FOCUS_RING}`,
  "crash-dialog-copy": `rounded-shadcn-button px-md text-label font-semibold text-accent min-block-shadcn-button touch:min-block-touch-target ${FOCUS_RING}`,
} satisfies Record<string, string>;

export type ButtonLook = keyof typeof BUTTON_LOOKS;

type ButtonVariant = "primary" | "secondary";

const HAS_NATIVE_LOOK = {
  android: true,
  ios: true,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

const NATIVE_VARIANT_OF: Partial<Record<ButtonLook, ButtonVariant>> = {
  "dialog-primary": "primary",
  "dialog-secondary": "secondary",
};

const NATIVE_BUTTON = `native-target inline-flex items-center justify-center gap-sm rounded-native-button px-native-button-inline text-native-button leading-native-button font-native-button tracking-native-button transition-control min-block-native-button ${FOCUS_RING}`;

const NATIVE_VARIANTS = {
  primary:
    "bg-native-button-primary text-native-on-button-primary enabled:hover:tint-native-button-primary-hover enabled:active:tint-native-button-primary-pressed",
  secondary:
    "bg-native-button-secondary text-native-on-button-secondary enabled:hover:tint-native-button-secondary-hover enabled:active:tint-native-button-secondary-pressed",
} satisfies Record<ButtonVariant, string>;

export function buttonClasses(look: ButtonLook, platform: Platform): string {
  const variant = NATIVE_VARIANT_OF[look];
  if (variant === undefined || !HAS_NATIVE_LOOK[platform]) {
    return BUTTON_LOOKS[look];
  }
  return `${NATIVE_BUTTON} ${NATIVE_VARIANTS[variant]}`;
}
