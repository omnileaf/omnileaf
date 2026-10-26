import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

export interface ListRowLook {
  readonly row: string;
  readonly link: string;
  readonly title: string;
  readonly meta: string;
}

const LINK =
  "flex flex-1 items-center gap-md py-list-row-block min-inline-none";

const TODAY: ListRowLook = {
  row: "flex items-center gap-xs border-be border-border",
  link: `${LINK} rounded-control`,
  title: "line-clamp-2 font-medium wrap-break-word",
  meta: "text-detail text-muted",
};

const PHONE: ListRowLook = {
  row: "relative flex items-center gap-xs after:absolute after:inset-e-none after:inset-be-none after:inset-s-[calc(var(--spacing-list-cover)+2px+var(--spacing-md))] after:bg-native-row-rule after:block-native-hairline",
  link: `${LINK} transition-control active:bg-native-row-selected active:[--secondary-text:var(--native-color-on-row-selected-muted)]`,
  title:
    "line-clamp-2 wrap-break-word text-native-row-title leading-native-row-title font-native-row-title tracking-native-row-title",
  meta: "text-native-row-subtitle leading-native-row-subtitle tracking-native-row-subtitle text-muted",
};

export function listRowLook(
  platform: Platform,
  width: WidthClass,
): ListRowLook {
  return isPhone(platform, width) ? PHONE : TODAY;
}
