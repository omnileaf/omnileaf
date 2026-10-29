export const ROW_SUBTITLE_TYPE =
  "text-native-row-subtitle leading-native-row-subtitle tracking-native-row-subtitle";

const ABOUT_ROW =
  "flex inline-full items-center px-list-row text-start transition-control hover:bg-hover active:bg-pressed";

export const ROW_FOCUS_RING =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

const ROW = [
  "flex inline-full items-center gap-native-row-gap text-start transition-control not-aria-disabled:hover:bg-hover not-aria-disabled:active:bg-native-row-selected data-picked:bg-native-row-selected py-native-row-block ps-native-row-start pe-native-row-end min-block-native-row has-data-[slot=item-description]:min-block-native-row-two",
  "**:data-[slot=item-title]:text-native-row-title **:data-[slot=item-title]:leading-native-row-title **:data-[slot=item-title]:font-native-row-title **:data-[slot=item-title]:tracking-native-row-title",
  "**:data-[slot=item-description]:text-native-row-subtitle **:data-[slot=item-description]:leading-native-row-subtitle **:data-[slot=item-description]:tracking-native-row-subtitle",
  "not-aria-disabled:active:[--secondary-text:var(--native-color-on-row-selected-muted)] data-picked:[--secondary-text:var(--native-color-on-row-selected-muted)]",
].join(" ");

const PRESS_STATES = /(?:^|:)(?:hover|active):|^data-picked:/;

const STATIC_ROW = ROW.split(" ")
  .filter((name) => !PRESS_STATES.test(name))
  .join(" ");

export const ITEM_LOOKS = {
  row: ROW,
  "row-static": STATIC_ROW,
  folder:
    "flex items-center gap-md py-sm ps-md pe-sm min-block-row expanded:min-block-row-compact",
  "settings-section":
    "flex items-center gap-list-row py-sm ps-list-row pe-md transition-control min-block-4xl hover:bg-hover active:bg-pressed android:gap-lg android:px-lg android:min-block-settings-entry ios:gap-md ios:py-xs ios:ps-lg ios:pe-md ios:min-block-settings-row desktop:gap-md",
  "about-phone": `${ABOUT_ROW} gap-list-row py-sm min-block-4xl`,
  "about-pane": `${ABOUT_ROW} gap-md py-xs min-block-phone-row`,
  "about-version":
    "flex flex-wrap items-center gap-md py-sm ps-list-row pe-sm min-block-4xl",
  "history-phone":
    "flex flex-1 items-center gap-md ps-md pe-xs transition-control min-inline-none min-block-history-row hover:bg-hover active:bg-pressed desktop:large:hidden",
  "reader-sheet-action":
    "flex items-center gap-md rounded-control px-md text-body font-medium min-block-touch-target not-aria-disabled:hover:bg-hover",
  "reader-jump-row":
    "flex flex-col gap-2xs border-s-2 border-transparent px-md py-sm transition-control hover:bg-hover active:bg-pressed expanded:rounded-shadcn-control",
  "history-desktop":
    "hidden flex-1 items-center gap-lg min-inline-none min-block-history-row-wide desktop:large:flex",
} satisfies Record<string, string>;

export type ItemLook = keyof typeof ITEM_LOOKS;
