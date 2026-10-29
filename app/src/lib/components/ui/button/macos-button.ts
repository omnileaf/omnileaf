import type { ButtonSize, ButtonVariant } from "./looks.ts";

const BASE =
  "inline-flex items-center justify-center gap-xs tracking-native-button whitespace-nowrap transition-control";

const SIZES = {
  small:
    "min-block-native-button-small rounded-native-button-small px-native-button-small-inline text-native-button-small leading-native-button-small font-native-button",
  regular:
    "min-block-native-button rounded-native-button px-native-button-inline text-native-button leading-native-button font-native-button",
  large:
    "min-block-native-button-large rounded-full px-native-button-large-inline text-native-button-large leading-native-button-large font-native-button-large",
} satisfies Record<ButtonSize, string>;

const ICON_ONLY = {
  small:
    "block-native-button-small inline-native-button-small rounded-full px-none font-native-button",
  regular:
    "block-native-button inline-native-button rounded-full px-none font-native-button",
  large:
    "block-native-button-large inline-native-button-large rounded-full px-none font-native-button-large",
} satisfies Record<ButtonSize, string>;

const INERT = "disabled:pointer-events-none aria-disabled:pointer-events-none";

const ICON_ONLY_FILL = `bg-native-icon-button-fill text-native-on-button-secondary not-disabled:not-aria-disabled:hover:bg-native-icon-button-fill-hover not-disabled:not-aria-disabled:active:bg-native-icon-button-fill-pressed disabled:bg-native-icon-button-fill-disabled aria-disabled:bg-native-icon-button-fill-disabled disabled:text-native-on-button-disabled aria-disabled:text-native-on-button-disabled ${INERT}`;

const SECONDARY = `bg-native-button-secondary text-native-on-button-secondary not-disabled:not-aria-disabled:hover:bg-native-control-fill-hover not-disabled:not-aria-disabled:active:bg-native-control-fill-pressed disabled:bg-native-button-secondary/50 aria-disabled:bg-native-button-secondary/50 disabled:text-native-on-button-disabled aria-disabled:text-native-on-button-disabled ${INERT}`;

const VARIANTS = {
  primary: `bg-native-button-primary text-native-on-button-primary not-disabled:not-aria-disabled:hover:tint-native-button-primary-hover not-disabled:not-aria-disabled:active:tint-native-button-primary-pressed disabled:bg-native-button-primary/40 aria-disabled:bg-native-button-primary/40 disabled:text-native-on-button-primary/50 aria-disabled:text-native-on-button-primary/50 ${INERT}`,
  secondary: SECONDARY,
  outline: SECONDARY,
  destructive: `bg-native-button-destructive text-native-on-button-destructive not-disabled:not-aria-disabled:hover:tint-native-button-destructive-hover not-disabled:not-aria-disabled:active:tint-native-button-destructive-pressed disabled:bg-native-button-destructive/60 aria-disabled:bg-native-button-destructive/60 disabled:text-native-on-button-destructive/40 aria-disabled:text-native-on-button-destructive/40 ${INERT}`,
  plain: `bg-transparent text-native-on-button-plain not-disabled:not-aria-disabled:active:text-native-on-button-plain-pressed disabled:text-native-on-button-plain/50 aria-disabled:text-native-on-button-plain/50 ${INERT}`,
} satisfies Record<Exclude<ButtonVariant, "link">, string>;

const LINK = `min-block-none rounded-native-button-small bg-transparent px-none text-native-button leading-native-button font-native-button text-native-on-button-link underline-offset-2 not-disabled:not-aria-disabled:hover:underline not-disabled:not-aria-disabled:active:underline disabled:text-native-on-button-link/50 aria-disabled:text-native-on-button-link/50 ${INERT}`;

export function macosButtonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  isIconOnly: boolean,
): string {
  if (variant === "link") {
    return `${BASE} ${LINK}`;
  }
  if (!isIconOnly) {
    return `${BASE} ${SIZES[size]} ${VARIANTS[variant]}`;
  }
  const fills = variant === "secondary" || variant === "outline";
  return `${BASE} ${ICON_ONLY[size]} ${fills ? ICON_ONLY_FILL : VARIANTS[variant]}`;
}
