import { cn } from "#lib/components/cn.ts";
import { variantClasses } from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { type PhonePlatform, phoneOf } from "#lib/page/platform.ts";

import { READER_BUTTON, READER_GLASS, READER_ICON_SIZE } from "./reader-bar.ts";

export interface AutoScrollLook {
  readonly place: string;
  readonly bar: string;
  readonly leadsWithToggle: boolean;
  readonly toggle: string;
  readonly readout: string;
  readonly state: string;
  readonly actions: string;
  readonly speedButton: string;
  readonly stopButton: string;
  readonly hasKitIcons: boolean;
  readonly iconSize: number;
}

const GLASS_LOOK: AutoScrollLook = {
  place:
    "absolute inset-x-reader-bar-inline inset-be-reader-bar-bottom expanded:inset-x-lg expanded:inset-be-lg expanded:mx-auto expanded:max-inline-reader-auto-bar",
  bar: cn(
    READER_GLASS,
    "grid grid-cols-auto-scroll items-center gap-sm px-md py-sm",
  ),
  leadsWithToggle: false,
  toggle:
    "flex items-center justify-center rounded-full bg-foreground text-background block-touch-target inline-touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  readout: "flex flex-col",
  state: "text-small font-semibold",
  actions: "flex items-center justify-end gap-xs",
  speedButton: READER_BUTTON,
  stopButton: READER_BUTTON,
  hasKitIcons: false,
  iconSize: READER_ICON_SIZE,
};

const MATERIAL_ICON_SIZE = 24;

const FLOATING_TOOLBAR_LOOK: AutoScrollLook = {
  place: "absolute inset-x-lg inset-be-reader-auto-bar-bottom",
  bar: "flex items-center gap-md rounded-full bg-native-top-bar-scrolled ps-sm pe-reader-auto-bar-end py-sm text-foreground shadow-native-toolbar-lift",
  leadsWithToggle: true,
  toggle: cn(
    variantClasses("primary", "regular", true, "android"),
    "block-native-target inline-native-target",
  ),
  readout: "flex min-inline-none flex-1 flex-col",
  state: "text-body font-medium",
  actions: "flex shrink-0 items-center gap-sm",
  speedButton: variantClasses("secondary", "regular", true, "android"),
  stopButton: cn(
    variantClasses("plain", "regular", true, "android"),
    "text-muted",
  ),
  hasKitIcons: true,
  iconSize: MATERIAL_ICON_SIZE,
};

const PHONE_LOOKS = {
  android: FLOATING_TOOLBAR_LOOK,
  ios: GLASS_LOOK,
} satisfies Record<PhonePlatform, AutoScrollLook>;

export function autoScrollLook(
  platform: Platform,
  width: WidthClass,
): AutoScrollLook {
  const phone = phoneOf(platform, width);
  return phone === undefined ? GLASS_LOOK : PHONE_LOOKS[phone];
}
