import type { ItemLook } from "#lib/components/ui/item/index.ts";

export type AboutLook = "phone" | "pane";

export type HintKind = "prose" | "address";

export const ROW_LOOKS = {
  phone: "about-phone",
  pane: "about-pane",
} satisfies Record<AboutLook, ItemLook>;

export const ROW_ICON_SIZES = { phone: 18, pane: 16 } satisfies Record<
  AboutLook,
  number
>;
