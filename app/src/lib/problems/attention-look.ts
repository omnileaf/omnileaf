import type {
  ButtonLook,
  ButtonVariant,
} from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

export interface AttentionFix {
  readonly look?: ButtonLook;
  readonly variant?: ButtonVariant;
  readonly class: string;
}

export interface AttentionLook {
  readonly list: string;
  readonly row: string;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly fix: AttentionFix;
  readonly flyout: string;
  readonly flyoutHeading: string;
  readonly badge: string;
  readonly sidebarBadge: string;
  readonly hasFoldedDot: boolean;
}

const TODAYS_LOOK: AttentionLook = {
  list: "divide-y divide-border overflow-hidden rounded-list border border-border",
  row: "gap-md py-sm ps-md pe-md",
  icon: "text-warning-strong",
  title: "text-label font-medium",
  detail: "line-clamp-2 text-label text-muted",
  fix: {
    look: "outline",
    class:
      "rounded-full px-lg text-body font-medium max-inline-1/2 min-block-touch-target desktop:rounded-shadcn-control desktop:px-md desktop:text-label desktop:min-block-compact-button",
  },
  flyout: "gap-sm p-lg",
  flyoutHeading: "text-label font-semibold",
  badge: "px-sm py-2xs text-caption",
  sidebarBadge: "px-sm py-2xs text-caption sidebar-hidden:hidden",
  hasFoldedDot: true,
};

const INFO_BADGE =
  "inline-flex items-center justify-center rounded-full bg-native-button-primary px-2xs text-caption font-semibold text-native-on-button-primary block-lg min-inline-lg";

const WINDOWS_LOOK: AttentionLook = {
  list: "divide-y divide-native-row-rule",
  row: "gap-md py-sm",
  icon: "text-native-info-bar-warning-icon",
  title: "text-label font-regular",
  detail: "line-clamp-2 text-caption text-muted",
  fix: { variant: "secondary", class: "max-inline-1/2" },
  flyout:
    "gap-md rounded-native-menu border-native-menu-edge bg-native-menu p-lg text-native-on-menu shadow-native-menu-lift",
  flyoutHeading: "text-label font-semibold",
  badge: INFO_BADGE,
  sidebarBadge: `${INFO_BADGE} sidebar-hidden:absolute sidebar-hidden:inset-e-sm sidebar-hidden:inset-bs-xs`,
  hasFoldedDot: false,
};

const ATTENTION_LOOKS = {
  android: TODAYS_LOOK,
  ios: TODAYS_LOOK,
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: WINDOWS_LOOK,
} satisfies Record<Platform, AttentionLook>;

export function attentionLook(platform: Platform): AttentionLook {
  return ATTENTION_LOOKS[platform];
}
