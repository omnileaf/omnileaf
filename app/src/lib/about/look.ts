import type { ItemLook } from "#lib/components/ui/item/index.ts";

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
