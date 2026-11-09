import {
  ROW_SUBTITLE_TYPE,
  ROW_TITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { type PhonePlatform, phoneOf } from "#lib/page/platform.ts";

export interface ListRowLook {
  readonly row: string;
  readonly cover: string;
  readonly link: string;
  readonly title: string;
  readonly meta: string;
  readonly unread: string;
}

const LINK =
  "flex flex-1 items-center gap-md py-list-row-block min-inline-none wrap-normal";

const COVER = "rounded-list-cover inline-list-cover";

const UNREAD = "px-sm py-2xs text-caption";

const TODAY: ListRowLook = {
  row: "flex items-center gap-xs border-be border-border",
  cover: COVER,
  link: `${LINK} rounded-control`,
  title: "line-clamp-2 font-medium wrap-break-word",
  meta: "text-detail text-muted",
  unread: UNREAD,
};

const PHONE: ListRowLook = {
  row: "relative flex items-center gap-xs after:absolute after:inset-e-none after:inset-be-none after:inset-s-[calc(var(--spacing-native-list-cover)+var(--spacing-md))] after:bg-native-row-rule after:block-native-hairline",
  cover: COVER,
  link: `${LINK} transition-control active:bg-native-row-selected active:[--secondary-text:var(--native-color-on-row-selected-muted)]`,
  title: `line-clamp-2 wrap-break-word ${ROW_TITLE_TYPE}`,
  meta: `${ROW_SUBTITLE_TYPE} text-muted`,
  unread: UNREAD,
};

const NATIVE_LIST_COVER =
  "rounded-list-cover box-border! inline-native-list-cover";

const ANDROID_PHONE: ListRowLook = {
  ...PHONE,
  cover: `${NATIVE_LIST_COVER} border-0!`,
  unread:
    "px-sm py-xs text-native-tab/native-tab font-native-tab tracking-native-tab bg-native-cover-badge text-native-on-cover-badge",
};

const IOS_PHONE: ListRowLook = {
  ...PHONE,
  cover: NATIVE_LIST_COVER,
};

const PHONE_ROWS = {
  android: ANDROID_PHONE,
  ios: IOS_PHONE,
} satisfies Record<PhonePlatform, ListRowLook>;

export function listRowLook(
  platform: Platform,
  width: WidthClass,
): ListRowLook {
  const phone = phoneOf(platform, width);
  return phone === undefined ? TODAY : PHONE_ROWS[phone];
}
