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
}

type PhoneActions = Readonly<Record<ActionRank, PhoneAction>>;

const PHONE_ACTIONS: Readonly<Record<Platform, PhoneActions | undefined>> = {
  ios: {
    main: { variant: "primary", size: "large" },
    other: { variant: "secondary", size: "large" },
  },
  android: {
    main: { variant: "primary", size: "regular" },
    other: { variant: "outline", size: "regular" },
  },
  linux: undefined,
  macos: undefined,
  windows: undefined,
};

const DIMMED_WHEN_DISABLED = "disabled:opacity-60";

const PHONE_GROUPS = {
  ios: {
    group:
      "mx-auto inline-grid grid-flow-row justify-items-stretch gap-md max-inline-native-action-group",
    action: `whitespace-normal text-balance text-center ${DIMMED_WHEN_DISABLED}`,
  },
  android: {
    group: "flex flex-col items-center gap-sm",
    action: `max-inline-full ${DIMMED_WHEN_DISABLED}`,
  },
} satisfies Partial<Record<Platform, { group: string; action: string }>>;

export function phoneAction(
  platform: Platform,
  width: WidthClass,
  rank: ActionRank,
): PhoneAction | undefined {
  return isPhone(platform, width) ? PHONE_ACTIONS[platform]?.[rank] : undefined;
}

function classesOf(platform: Platform, action: PhoneAction): string {
  return variantClasses(action.variant, action.size, false, platform);
}

export function actionGroupLook(
  platform: Platform,
  width: WidthClass,
  today: ActionGroupLook,
): ActionGroupLook {
  const actions = PHONE_ACTIONS[platform];
  if (actions === undefined || !isPhone(platform, width)) {
    return today;
  }
  const phone = platform === "ios" ? PHONE_GROUPS.ios : PHONE_GROUPS.android;
  return {
    group: phone.group,
    main: `${classesOf(platform, actions.main)} ${phone.action}`,
    other: `${classesOf(platform, actions.other)} ${phone.action}`,
  };
}
