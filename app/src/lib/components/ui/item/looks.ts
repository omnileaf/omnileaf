export const ITEM_LOOKS = {
  folder:
    "flex items-center gap-md py-sm ps-md pe-sm min-block-row expanded:min-block-row-compact",
  "settings-link":
    "flex items-center gap-sm px-lg transition-control min-block-touch-target group-first:rounded-ss-card group-first:rounded-se-card group-last:rounded-ee-card group-last:rounded-es-card hover:bg-hover active:bg-pressed",
  "settings-section":
    "flex items-center gap-list-row py-sm ps-list-row pe-md transition-control min-block-4xl hover:bg-hover active:bg-pressed desktop:gap-md desktop:py-none desktop:min-block-settings-row",
} satisfies Record<string, string>;

export type ItemLook = keyof typeof ITEM_LOOKS;
