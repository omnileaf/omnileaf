import type { ButtonSize, ButtonVariant } from "./looks.ts";

const BASE =
  "inline-flex items-center justify-center gap-sm whitespace-nowrap border rounded-native-button text-native-button leading-native-button font-native-button tracking-native-button transition-control focus-visible:ring-1 focus-visible:ring-native-focus-ring-inner";

const REGULAR = "min-block-native-button px-native-button-inline";

const SIZES = {
  small: "min-block-native-button-small px-native-button-small-inline",
  regular: REGULAR,
  large: REGULAR,
} satisfies Record<ButtonSize, string>;

const REGULAR_ICON_ONLY =
  "min-block-native-button min-inline-native-button p-native-icon-button-inset";

const ICON_ONLY = {
  small:
    "min-block-native-button-small min-inline-native-button-small p-native-icon-button-small-inset",
  regular: REGULAR_ICON_ONLY,
  large: REGULAR_ICON_ONLY,
} satisfies Record<ButtonSize, string>;

const INERT = "disabled:pointer-events-none aria-disabled:pointer-events-none";

const ACCENT = `border-native-button-primary-edge border-be-native-button-primary-edge-bottom bg-native-button-primary text-native-on-button-primary not-disabled:not-aria-disabled:hover:bg-native-button-primary-hover not-disabled:not-aria-disabled:active:border-transparent not-disabled:not-aria-disabled:active:bg-native-button-primary-pressed disabled:border-transparent disabled:bg-native-button-primary-disabled disabled:text-native-on-button-primary-disabled ${INERT}`;

const STANDARD = `border-native-button-outline-edge border-bs-native-button-secondary-edge-top border-be-native-button-secondary-edge-bottom bg-native-button-secondary text-native-on-button-secondary not-disabled:not-aria-disabled:hover:bg-native-button-secondary-hover not-disabled:not-aria-disabled:active:border-native-button-outline-edge not-disabled:not-aria-disabled:active:bg-native-button-secondary-pressed not-disabled:not-aria-disabled:active:text-native-on-button-pressed disabled:border-native-button-outline-edge disabled:bg-native-button-secondary-disabled disabled:text-native-on-button-disabled ${INERT}`;

const SUBTLE_GROUND = `border-transparent bg-transparent not-disabled:not-aria-disabled:hover:bg-native-button-plain-hover not-disabled:not-aria-disabled:active:bg-native-button-plain-pressed disabled:text-native-on-button-disabled ${INERT}`;

const VARIANTS = {
  primary: ACCENT,
  secondary: STANDARD,
  outline: STANDARD,
  destructive: STANDARD,
  plain: `${SUBTLE_GROUND} text-native-on-button-plain not-disabled:not-aria-disabled:active:text-native-on-button-pressed`,
  link: `${SUBTLE_GROUND} text-native-on-button-link not-disabled:not-aria-disabled:active:text-native-on-button-link-pressed`,
} satisfies Record<ButtonVariant, string>;

export function windowsButtonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  isIconOnly: boolean,
): string {
  const shape = isIconOnly ? ICON_ONLY[size] : SIZES[size];
  return `${BASE} ${shape} ${VARIANTS[variant]}`;
}
