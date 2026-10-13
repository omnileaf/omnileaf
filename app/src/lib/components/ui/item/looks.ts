export const ITEM_LOOKS = {
  folder:
    "flex items-center gap-md py-sm ps-md pe-sm min-block-row expanded:min-block-row-compact",
} satisfies Record<string, string>;

export type ItemLook = keyof typeof ITEM_LOOKS;
