import type { ButtonSize, ButtonVariant } from "./looks.ts";

const PRESSED_SHAPE = {
  small: "active:rounded-android-sm",
  regular: "active:rounded-android-sm",
  large: "active:rounded-android-md",
} satisfies Record<ButtonSize, string>;

const LABEL_ICON = {
  small:
    "[&>svg]:block-native-button-icon [&>svg]:inline-native-button-icon [&>[data-icon]]:block-native-button-icon [&>[data-icon]]:inline-native-button-icon",
  regular:
    "[&>svg]:block-native-button-icon [&>svg]:inline-native-button-icon [&>[data-icon]]:block-native-button-icon [&>[data-icon]]:inline-native-button-icon",
  large:
    "[&>svg]:block-native-button-large-icon [&>svg]:inline-native-button-large-icon [&>[data-icon]]:block-native-button-large-icon [&>[data-icon]]:inline-native-button-large-icon",
} satisfies Record<ButtonSize, string>;

const DISABLED_LABEL = "disabled:text-native-on-control-disabled";

const DISABLED = {
  primary: `disabled:bg-native-control-disabled ${DISABLED_LABEL}`,
  secondary: `disabled:bg-native-control-disabled ${DISABLED_LABEL}`,
  outline: `disabled:border-native-control-disabled ${DISABLED_LABEL}`,
  plain: DISABLED_LABEL,
  link: DISABLED_LABEL,
  destructive: DISABLED_LABEL,
} satisfies Record<ButtonVariant, string>;

const FOCUSED_LAYER = {
  primary:
    "not-disabled:not-aria-disabled:focus-visible:tint-native-button-primary-pressed",
  secondary:
    "not-disabled:not-aria-disabled:focus-visible:tint-native-button-secondary-pressed",
  outline:
    "not-disabled:not-aria-disabled:focus-visible:tint-native-button-outline-pressed",
  plain:
    "not-disabled:not-aria-disabled:focus-visible:tint-native-button-plain-pressed",
  link: "not-disabled:not-aria-disabled:focus-visible:tint-native-button-plain-pressed",
  destructive:
    "not-disabled:not-aria-disabled:focus-visible:tint-native-button-destructive-pressed",
} satisfies Record<ButtonVariant, string>;

const FOCUSED_STANDARD_ICON_LAYER =
  "not-disabled:not-aria-disabled:focus-visible:tint-native-icon-button-plain-pressed";

export function isStandardIconButton(
  variant: ButtonVariant,
  isIconOnly: boolean,
): boolean {
  return isIconOnly && (variant === "plain" || variant === "link");
}

export function androidButtonStates(
  variant: ButtonVariant,
  size: ButtonSize,
  isIconOnly: boolean,
): string {
  const icon = isIconOnly ? "" : LABEL_ICON[size];
  const focusedLayer = isStandardIconButton(variant, isIconOnly)
    ? FOCUSED_STANDARD_ICON_LAYER
    : FOCUSED_LAYER[variant];
  return `transition-shape ${PRESSED_SHAPE[size]} ${DISABLED[variant]} ${focusedLayer} ${icon}`;
}
