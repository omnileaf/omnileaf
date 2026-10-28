import { cn } from "#lib/components/cn.ts";
import type { ButtonLook } from "#lib/components/ui/button/index.ts";
import type { ButtonVariant } from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

import { usesSetupPages } from "./setup-pages.ts";

export type StepButtonKind = Extract<
  ButtonLook,
  "primary" | "quiet" | "outline"
>;

const STEP_BUTTON =
  "flex items-center justify-center gap-sm px-xl text-body min-block-touch-target disabled:opacity-60 ios:rounded-ios-button android:rounded-full touch:min-block-touch-button desktop:rounded-button desktop:px-lg desktop:text-label desktop:min-block-pointer-target";

const SETUP_BUTTON =
  "flex items-center justify-center gap-sm min-inline-setup-button disabled:opacity-60";

const SETUP_KIND_CLASSES = {
  primary:
    "bg-native-button-primary text-native-on-button-primary not-disabled:hover:bg-native-accent-hover not-disabled:active:bg-native-accent-pressed",
  quiet: "",
  outline: "",
} as const satisfies Record<StepButtonKind, string>;

const KIND_CLASSES = {
  primary: "font-bold",
  quiet: "",
  outline: "enabled:hover:bg-hover enabled:active:bg-pressed",
} as const satisfies Record<StepButtonKind, string>;

const SETUP_VARIANTS = {
  primary: "primary",
  quiet: "secondary",
  outline: "secondary",
} as const satisfies Record<StepButtonKind, ButtonVariant>;

export function setupVariantOf(kind: StepButtonKind): ButtonVariant {
  return SETUP_VARIANTS[kind];
}

export function stepButtonClass(
  kind: StepButtonKind,
  platform: Platform,
): string {
  return usesSetupPages(platform)
    ? cn(SETUP_BUTTON, SETUP_KIND_CLASSES[kind])
    : cn(STEP_BUTTON, KIND_CLASSES[kind]);
}
