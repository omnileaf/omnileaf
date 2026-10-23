import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";
import { NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";

export const SERIES_CHIP =
  "shrink-0 border border-border bg-card text-foreground shadow-raised block-touch-target inline-touch-target";

export function barChip(platform: Platform, width: WidthClass): string {
  return isPhone(platform, width) ? NATIVE_TOP_BAR.barButton : SERIES_CHIP;
}
