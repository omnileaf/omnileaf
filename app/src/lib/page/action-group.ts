import type { Platform } from "#lib/ipc/bindings.ts";

import { variantClasses } from "#lib/components/ui/button/looks.ts";

import type { WidthClass } from "./breakpoints";
import { isPhone } from "./platform";

export interface ActionGroupLook {
  readonly group: string;
  readonly main: string;
  readonly other: string;
}

const DIMMED_WHEN_DISABLED = "disabled:opacity-60";

const WRAPPING_CAPSULE = `whitespace-normal text-balance text-center ${DIMMED_WHEN_DISABLED}`;

const PHONE_ACTIONS: Readonly<Record<Platform, ActionGroupLook | undefined>> = {
  ios: {
    group:
      "mx-auto inline-grid grid-flow-row justify-items-stretch gap-md max-inline-native-action-group",
    main: `${variantClasses("primary", "large", false, "ios")} ${WRAPPING_CAPSULE}`,
    other: `${variantClasses("secondary", "large", false, "ios")} ${WRAPPING_CAPSULE}`,
  },
  android: {
    group: "flex flex-col items-center gap-sm",
    main: `${variantClasses("primary", "regular", false, "android")} max-inline-full ${DIMMED_WHEN_DISABLED}`,
    other: `${variantClasses("outline", "regular", false, "android")} max-inline-full ${DIMMED_WHEN_DISABLED}`,
  },
  linux: undefined,
  macos: undefined,
  windows: undefined,
};

export function actionGroupLook(
  platform: Platform,
  width: WidthClass,
  today: ActionGroupLook,
): ActionGroupLook {
  const phone = PHONE_ACTIONS[platform];
  return phone !== undefined && isPhone(platform, width) ? phone : today;
}
