import type { Platform } from "#lib/ipc/bindings.ts";

export interface MenuLook {
  readonly surface: string;
  readonly item: string;
  readonly dangerItem: string;
  readonly chosenItem: string;
  readonly check: string;
  readonly uncheckedCheck: string;
  readonly rule: string;
}

const TODAYS_LOOK: MenuLook = {
  surface: "",
  item: "",
  dangerItem: "",
  chosenItem: "",
  check: "",
  uncheckedCheck: "",
  rule: "",
};

const NATIVE_SURFACE =
  "max-medium:rounded-native-menu max-medium:border-0 max-medium:bg-native-menu max-medium:px-native-menu-inline max-medium:py-native-menu-block max-medium:text-native-on-menu max-medium:shadow-native-menu-lift";

const NATIVE_LOOK: MenuLook = {
  surface: NATIVE_SURFACE,
  item: "max-medium:rounded-native-menu-item max-medium:px-native-menu-item-inline max-medium:text-native-row-title max-medium:leading-native-row-title max-medium:font-native-row-title max-medium:tracking-native-row-title max-medium:min-block-native-menu-item max-medium:first:rounded-t-native-menu-item-end max-medium:last:rounded-b-native-menu-item-end max-medium:[[role=separator]+&]:rounded-t-native-menu-item-end max-medium:[&:has(+[role=separator])]:rounded-b-native-menu-item-end max-medium:data-highlighted:bg-native-row-pressed max-medium:data-highlighted:text-native-on-menu",
  dangerItem:
    "max-medium:text-native-on-button-destructive max-medium:data-highlighted:text-native-on-button-destructive",
  chosenItem:
    "max-medium:data-[state=checked]:rounded-native-menu-item-end max-medium:data-[state=checked]:bg-native-menu-chosen max-medium:data-[state=checked]:text-native-on-menu-chosen max-medium:data-[state=checked]:data-highlighted:bg-linear-to-r max-medium:data-[state=checked]:data-highlighted:from-native-row-pressed max-medium:data-[state=checked]:data-highlighted:to-native-row-pressed",
  check: "max-medium:order-first",
  uncheckedCheck: "",
  rule: "max-medium:mx-native-menu-rule-inline max-medium:my-native-menu-rule-block max-medium:border-native-menu-rule",
};

const MENU_LOOKS = {
  ios: {
    ...NATIVE_LOOK,
    surface: `${NATIVE_SURFACE} max-medium:inset-ring max-medium:inset-ring-glass-edge max-medium:backdrop-saturate-120`,
  },
  android: { ...NATIVE_LOOK, uncheckedCheck: "max-medium:hidden" },
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, MenuLook>;

export function menuLook(platform: Platform): MenuLook {
  return MENU_LOOKS[platform];
}
