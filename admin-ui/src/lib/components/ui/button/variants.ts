import { cn } from "#lib/cn.ts";
import { CONTROL_HEIGHT } from "#lib/components/ui/controls.ts";

export const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-small font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

export const BUTTON_VARIANTS = {
  default: "bg-accent text-on-accent hover:bg-accent/90",
  secondary: "bg-chip text-foreground hover:bg-border",
  outline: "border border-field-edge bg-card text-foreground hover:bg-well",
  ghost: "text-foreground hover:bg-chip",
} satisfies Record<string, string>;

export const BUTTON_SIZES = {
  sm: "block-11 px-3 tablet:block-8",
  default: `${CONTROL_HEIGHT} px-4`,
  lg: "block-12 px-6 tablet:block-11",
  icon: "block-11 inline-11 tablet:block-9 tablet:inline-9",
} satisfies Record<string, string>;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function buttonLook(variant: ButtonVariant, size: ButtonSize): string {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size]);
}
