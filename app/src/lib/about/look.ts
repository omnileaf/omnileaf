export type AboutLook = "phone" | "pane";

export type HintKind = "prose" | "address";

const ROW =
  "flex inline-full items-center px-list-row text-start transition-control hover:bg-hover active:bg-pressed";

export const ROW_LOOKS = {
  phone: `${ROW} gap-list-row py-sm min-block-4xl`,
  pane: `${ROW} gap-md py-xs min-block-phone-row`,
} satisfies Record<AboutLook, string>;

export const ROW_ICON_SIZES = { phone: 18, pane: 16 } satisfies Record<
  AboutLook,
  number
>;
