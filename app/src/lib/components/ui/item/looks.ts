const ABOUT_ROW =
  "flex inline-full items-center px-list-row text-start transition-control hover:bg-hover active:bg-pressed";

export const ITEM_LOOKS = {
  folder:
    "flex items-center gap-md py-sm ps-md pe-sm min-block-row expanded:min-block-row-compact",
  "settings-link":
    "flex items-center gap-sm px-lg transition-control min-block-touch-target group-first:rounded-ss-card group-first:rounded-se-card group-last:rounded-ee-card group-last:rounded-es-card hover:bg-hover active:bg-pressed",
  "settings-section":
    "flex items-center gap-list-row py-sm ps-list-row pe-md transition-control min-block-4xl hover:bg-hover active:bg-pressed desktop:gap-md desktop:py-none desktop:min-block-settings-row",
  "about-phone": `${ABOUT_ROW} gap-list-row py-sm min-block-4xl`,
  "about-pane": `${ABOUT_ROW} gap-md py-xs min-block-phone-row`,
  "about-version":
    "flex flex-wrap items-center gap-md py-sm ps-list-row pe-sm min-block-4xl",
} satisfies Record<string, string>;

export type ItemLook = keyof typeof ITEM_LOOKS;
