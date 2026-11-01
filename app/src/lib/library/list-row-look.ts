import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

export interface ListRowLook {
  readonly row: string;
  readonly cover: string;
  readonly link: string;
  readonly title: string;
  readonly meta: string;
}

const LINK =
  "flex flex-1 items-center gap-md py-list-row-block min-inline-none wrap-normal";

const COVER = "rounded-list-cover inline-list-cover";

const TODAY: ListRowLook = {
  row: "flex items-center gap-xs border-be border-border",
  cover: COVER,
  link: `${LINK} rounded-control`,
  title: "line-clamp-2 font-medium wrap-break-word",
  meta: "text-detail text-muted",
};

const PHONE: ListRowLook = {
  row: "relative flex items-center gap-xs after:absolute after:inset-e-none after:inset-be-none after:inset-s-[calc(var(--spacing-native-list-cover)+var(--spacing-md))] after:bg-native-row-rule after:block-native-hairline",
  cover: COVER,
  link: `${LINK} transition-control active:bg-native-row-selected active:[--secondary-text:var(--native-color-on-row-selected-muted)]`,
  title:
    "line-clamp-2 wrap-break-word text-native-row-title leading-native-row-title font-native-row-title tracking-native-row-title",
  meta: `${ROW_SUBTITLE_TYPE} text-muted`,
};

const IOS_PHONE: ListRowLook = {
  ...PHONE,
  cover: "rounded-list-cover box-border! inline-native-list-cover",
};

export function listRowLook(
  platform: Platform,
  width: WidthClass,
): ListRowLook {
  if (!isPhone(platform, width)) {
    return TODAY;
  }
  return platform === "ios" ? IOS_PHONE : PHONE;
}
