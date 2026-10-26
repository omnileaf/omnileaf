import type { Platform } from "#lib/ipc/bindings.ts";

import {
  type ButtonSize,
  type ButtonVariant,
  variantClasses,
} from "#lib/components/ui/button/looks.ts";

import type { WidthClass } from "./breakpoints";
import { isPhone } from "./platform";

export interface ActionGroupLook {
  readonly group: string;
  readonly main: string;
  readonly other: string;
}

export type ActionRank = "main" | "other";

export interface PhoneAction {
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly fit: string;
}

interface PhoneActions {
  readonly group: string;
  readonly fit: string;
  readonly main: Omit<PhoneAction, "fit">;
  readonly other: Omit<PhoneAction, "fit">;
}

const DIMMED_WHEN_DISABLED = "disabled:opacity-60";

const PHONE_ACTIONS: Readonly<Record<Platform, PhoneActions | undefined>> = {
  ios: {
    group:
      "mx-auto inline-grid grid-flow-row justify-items-stretch gap-md max-inline-native-action-group",
    fit: `whitespace-normal text-balance text-center ${DIMMED_WHEN_DISABLED}`,
    main: { variant: "primary", size: "large" },
    other: { variant: "secondary", size: "large" },
  },
  android: {
    group: "flex flex-col items-center gap-sm",
    fit: `max-inline-full ${DIMMED_WHEN_DISABLED}`,
    main: { variant: "primary", size: "regular" },
    other: { variant: "outline", size: "regular" },
  },
  linux: undefined,
  macos: undefined,
  windows: undefined,
};

function phoneActionsOn(
  platform: Platform,
  width: WidthClass,
): PhoneActions | undefined {
  return isPhone(platform, width) ? PHONE_ACTIONS[platform] : undefined;
}

export function phoneAction(
  platform: Platform,
  width: WidthClass,
  rank: ActionRank,
): PhoneAction | undefined {
  const actions = phoneActionsOn(platform, width);
  return actions === undefined
    ? undefined
    : { ...actions[rank], fit: actions.fit };
}

export function actionGroupLook(
  platform: Platform,
  width: WidthClass,
  today: ActionGroupLook,
): ActionGroupLook {
  const actions = phoneActionsOn(platform, width);
  if (actions === undefined) {
    return today;
  }
  const classesOf = (rank: ActionRank): string =>
    `${variantClasses(actions[rank].variant, actions[rank].size, false, platform)} ${actions.fit}`;
  return {
    group: actions.group,
    main: classesOf("main"),
    other: classesOf("other"),
  };
}
