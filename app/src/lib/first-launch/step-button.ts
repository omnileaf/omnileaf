import { cn } from "#lib/components/cn.ts";
import type { ButtonLook } from "#lib/components/ui/button/index.ts";

export type StepButtonKind = Extract<
  ButtonLook,
  "primary" | "quiet" | "outline"
>;

const STEP_BUTTON =
  "flex items-center justify-center gap-sm px-xl text-body min-block-touch-target disabled:opacity-60 ios:rounded-ios-button android:rounded-full touch:min-block-touch-button desktop:rounded-button desktop:px-lg desktop:text-label desktop:min-block-pointer-target";

const KIND_CLASSES = {
  primary: "font-bold",
  quiet: "",
  outline: "enabled:hover:bg-hover enabled:active:bg-pressed",
} as const satisfies Record<StepButtonKind, string>;

export function stepButtonClass(kind: StepButtonKind): string {
  return cn(STEP_BUTTON, KIND_CLASSES[kind]);
}
