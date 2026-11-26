import type { Platform } from "#lib/ipc/bindings.ts";

export interface PagesListLook {
  readonly sidebar: string;
  readonly caption: string | undefined;
  readonly nav: string;
  readonly list: string;
  readonly row: string;
  readonly rowOpen: string;
  readonly rowIdle: string;
  readonly icon: string;
  readonly iconIdle: string;
  readonly page: string;
}

const TODAYS_LOOK: PagesListLook = {
  sidebar:
    "hidden shrink-0 flex-col gap-lg border-e border-border px-md pbs-page-top pbe-xl two-pane:flex two-pane:inline-fit two-pane:max-inline-settings-list-widest two-pane:min-inline-settings-list",
  caption:
    "mbe-xs px-md text-page-title font-bold tracking-tight desktop:mbe-none desktop:px-sm desktop:text-caption desktop:font-semibold desktop:tracking-normal desktop:text-muted",
  nav: "flex flex-col gap-lg desktop:-mbs-md desktop:gap-2xs",
  list: "flex flex-col gap-2xs",
  row: "relative flex items-center gap-md rounded-row px-md text-label transition-control min-block-touch-target desktop:gap-sm desktop:rounded-sidebar-row desktop:px-sm desktop:text-small desktop:min-block-sidebar-row",
  rowOpen:
    "bg-accent-soft font-bold text-accent windows:before:absolute windows:before:inset-y-none windows:before:inset-s-none windows:before:my-auto windows:before:rounded-full windows:before:bg-native-nav-indicator windows:before:block-windows-indicator-length windows:before:inline-windows-indicator desktop:bg-sidebar-accent desktop:font-medium desktop:text-on-sidebar-accent",
  rowIdle:
    "font-medium text-sidebar-ink hover:bg-hover active:bg-pressed desktop:font-regular",
  icon: "shrink-0 desktop:block-sidebar-icon desktop:inline-sidebar-icon",
  iconIdle: "",
  page: "two-pane:max-inline-section android:settings-dividers",
};

const MACOS_LOOK: PagesListLook = {
  sidebar:
    "hidden shrink-0 flex-col bg-sidebar p-native-sidebar-pad two-pane:flex two-pane:inline-native-settings-sidebar",
  caption: undefined,
  nav: "flex flex-col mbs-native-titlebar",
  list: "flex flex-col",
  row: "group relative flex items-center gap-sm rounded-row ps-native-sidebar-item-start pe-native-sidebar-item-end text-native-button leading-native-button font-native-button text-foreground transition-control block-native-sidebar-item focus-visible:focus-ring focus-visible:-outline-offset-1",
  rowOpen: "bg-native-nav-indicator",
  rowIdle:
    "active:bg-native-button-primary active:text-native-on-button-primary",
  icon: "shrink-0 text-native-on-button-link group-active:text-native-on-button-primary",
  iconIdle: "",
  page: "two-pane:max-inline-native-settings-page",
};

const ANDROID_LOOK: PagesListLook = {
  ...TODAYS_LOOK,
  sidebar:
    "hidden shrink-0 flex-col pbs-page-top pbe-xl two-pane:flex two-pane:inline-android-settings-list",
  caption: "mbe-xs px-xl text-page-title tracking-normal",
  nav: "flex flex-col px-md py-sm",
  list: "flex flex-col",
  row: "relative flex items-center gap-native-row-gap rounded-full ps-native-row-start pe-native-row-end text-native-row-title/native-row-title tracking-native-row-title transition-control min-block-native-row focus-visible:focus-ring",
  rowOpen: "bg-native-tab-pill text-native-on-tab-pill",
  rowIdle: "text-foreground hover:bg-hover active:bg-pressed",
  icon: "shrink-0",
  iconIdle: "text-muted",
};

const PAGES_LIST_LOOKS = {
  android: ANDROID_LOOK,
  ios: TODAYS_LOOK,
  linux: TODAYS_LOOK,
  macos: MACOS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, PagesListLook>;

export function pagesListLook(platform: Platform): PagesListLook {
  return PAGES_LIST_LOOKS[platform];
}
