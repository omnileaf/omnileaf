import {
  ROW_SUBTITLE_TYPE,
  ROW_TITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

export interface WelcomeStepLook {
  readonly badge: string;
  readonly appIcon: string;
  readonly promises: string;
  readonly promise: string;
  readonly marker: string;
  readonly title: string;
  readonly detail: string;
  readonly usesMaterialIcons: boolean;
}

const WINDOWS_LOOK: WelcomeStepLook = {
  badge: "",
  appIcon: "block-setup-app-icon inline-setup-app-icon",
  promises: "gap-lg pbs-md",
  promise: "items-start gap-promise-gap",
  marker: "text-windows-accent",
  title: "text-label/setup-body font-semibold",
  detail: "text-footnote",
  usesMaterialIcons: false,
};

const ANDROID_LOOK: WelcomeStepLook = {
  badge: "pbs-xl",
  appIcon: "block-app-icon inline-app-icon rounded-full",
  promises: "gap-promise-gap",
  promise: "items-center gap-lg",
  marker: "text-foreground",
  title: ROW_TITLE_TYPE,
  detail: ROW_SUBTITLE_TYPE,
  usesMaterialIcons: true,
};

const TILE_LOOK: WelcomeStepLook = {
  badge: "pbs-xl",
  appIcon: "block-app-icon inline-app-icon",
  promises: "gap-promise-gap",
  promise: "items-center gap-promise-gap",
  marker:
    "rounded-control bg-step-tint text-accent block-promise-tile inline-promise-tile",
  title: "font-semibold",
  detail: "text-footnote",
  usesMaterialIcons: false,
};

const WELCOME_STEP_LOOKS = {
  android: ANDROID_LOOK,
  ios: TILE_LOOK,
  linux: TILE_LOOK,
  macos: TILE_LOOK,
  windows: WINDOWS_LOOK,
} satisfies Record<Platform, WelcomeStepLook>;

export function welcomeStepLook(platform: Platform): WelcomeStepLook {
  return WELCOME_STEP_LOOKS[platform];
}
