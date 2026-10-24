import type { Platform } from "#lib/ipc/bindings.ts";

export interface TabBarLook {
  readonly bar: string;
  readonly row: string;
  readonly glassPill: string;
  readonly cell: string;
  readonly tab: string;
  readonly iconHolder: string;
  readonly currentTab: string;
  readonly otherTab: string;
  readonly tone: string;
  readonly icon: string;
  readonly currentIcon: string;
}

const TODAYS_LOOK: TabBarLook = {
  bar: "max-medium:pe-safe-end",
  row: "",
  glassPill: "",
  cell: "",
  tab: "",
  iconHolder: "",
  currentTab: "",
  otherTab: "",
  tone: "",
  icon: "",
  currentIcon: "",
};

const NATIVE_TAB =
  "max-medium:flex-1 max-medium:min-inline-none max-medium:justify-center max-medium:text-native-tab max-medium:leading-native-tab max-medium:font-native-tab max-medium:tracking-native-tab";

const NATIVE_TABS = {
  cell: "max-medium:flex max-medium:flex-initial max-medium:inline-native-tab-cell",
  currentTab: "max-medium:text-native-on-tab-current",
  otherTab: "max-medium:text-native-on-tab",
  icon: "max-medium:block-native-icon max-medium:inline-native-icon",
  currentIcon: "max-medium:text-native-on-tab-pill",
};

const TAB_BAR_LOOKS = {
  ios: {
    ...NATIVE_TABS,
    bar: "max-medium:fixed max-medium:inset-x-lg max-medium:inset-be-floating-gap max-medium:z-tab-bar max-medium:mx-auto max-medium:inline-fit max-medium:rounded-full max-medium:border-0 max-medium:inset-ring max-medium:inset-ring-glass-edge max-medium:bg-native-tab-bar max-medium:py-native-tab-bar-inset max-medium:px-native-tab-bar-inline max-medium:shadow-floating max-medium:backdrop-blur-glass max-medium:backdrop-saturate-160 max-medium:block-native-tab-bar",
    row: "max-medium:relative max-medium:p-none max-medium:block-full",
    glassPill: "max-medium:block max-medium:bg-native-tab-pill",
    tab: `${NATIVE_TAB} max-medium:gap-2xs max-medium:rounded-full max-medium:py-none`,
    iconHolder: "max-medium:block-auto max-medium:inline-auto",
    tone: "max-medium:hidden",
  },
  android: {
    ...NATIVE_TABS,
    bar: "max-medium:pe-safe-end max-medium:border-bs-0 max-medium:bg-native-tab-bar",
    row: "max-medium:p-none max-medium:min-block-native-tab-bar",
    glassPill: "",
    tab: NATIVE_TAB,
    iconHolder: "",
    tone: "max-medium:bg-native-tab-pill medium:bg-android-tonal",
  },
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, TabBarLook>;

export function tabBarLook(platform: Platform): TabBarLook {
  return TAB_BAR_LOOKS[platform];
}
