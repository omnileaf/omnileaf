import type { ItemLook } from "#lib/components/ui/item/index.ts";
import { GROUP_PLATE } from "#lib/page/plates.ts";
import { FLUSH_LIST } from "#lib/settings/android-flush-look.ts";

export type AboutLook = "phone" | "pane" | "android";

export type HintKind = "prose" | "address";

export const ROW_LOOKS = {
  phone: "about-phone",
  pane: "about-pane",
  android: "row",
} satisfies Record<AboutLook, ItemLook>;

export const ROW_ICON_SIZES = {
  phone: 18,
  pane: 16,
  android: 24,
} satisfies Record<AboutLook, number>;

const CARD_LIST = `divide-y divide-border overflow-hidden rounded-list border border-border bg-card ${GROUP_PLATE}`;

export const ROW_LISTS = {
  phone: CARD_LIST,
  pane: CARD_LIST,
  android: FLUSH_LIST,
} satisfies Record<AboutLook, string>;
