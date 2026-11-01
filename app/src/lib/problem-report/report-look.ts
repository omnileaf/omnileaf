import type {
  ButtonLook,
  ButtonVariant,
} from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

export interface ReportButton {
  readonly look?: ButtonLook;
  readonly variant?: ButtonVariant;
  readonly class: string;
}

export interface ReportLook {
  readonly card: string;
  readonly isPlated: boolean;
  readonly field: string;
  readonly send: ReportButton;
}

const TODAYS_LOOK: ReportLook = {
  isPlated: true,
  card: "rounded-card border border-border bg-card px-lg py-field-card-block",
  field:
    "flex-none rounded-shadcn-control border border-field bg-input-fill px-md text-label shadow-raised block-pointer-button focus:border-accent aria-invalid:border-danger touch:text-body touch:block-touch-target",
  send: {
    look: "primary",
    class:
      "flex items-center justify-center gap-sm rounded-shadcn-button px-lg text-body font-medium min-block-shadcn-button expanded:self-start ios:rounded-ios-button ios:font-semibold ios:min-block-ios-control macos:shadow-raised linux:shadow-raised desktop:px-md desktop:text-label",
  },
};

const WINDOWS_LOOK: ReportLook = {
  isPlated: true,
  card: TODAYS_LOOK.card,
  field:
    "flex-none rounded-windows-control border border-windows-stroke border-be-windows-stroke-strong bg-windows-control px-md text-label block-shadcn-control focus:border-be-2 focus:border-be-windows-accent aria-invalid:border-danger",
  send: { variant: "primary", class: "expanded:self-start" },
};

const ANDROID_LOOK: ReportLook = {
  isPlated: false,
  card: "px-none",
  field:
    "flex-none rounded-native-outlined-field border border-native-button-outline-edge bg-transparent px-lg text-body shadow-none block-native-outlined-field focus:border-accent aria-invalid:border-danger",
  send: {
    variant: "primary",
    class: "flex items-center justify-center gap-sm px-lg",
  },
};

const REPORT_LOOKS = {
  android: ANDROID_LOOK,
  ios: TODAYS_LOOK,
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: WINDOWS_LOOK,
} satisfies Record<Platform, ReportLook>;

export function reportLook(platform: Platform): ReportLook {
  return REPORT_LOOKS[platform];
}
