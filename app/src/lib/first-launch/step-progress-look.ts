import type { Platform } from "#lib/ipc/bindings.ts";

export interface StepProgressLook {
  readonly isBar: boolean;
  readonly root: string;
  readonly track: string;
  readonly rule: string;
  readonly fill: string;
  readonly count: string;
}

const DOTS_LOOK: StepProgressLook = {
  isBar: false,
  root: "flex-1 gap-sm",
  track: "",
  rule: "",
  fill: "",
  count: "",
};

const BAR_LOOK: StepProgressLook = {
  isBar: true,
  root: "gap-md",
  track: "block-setup-bar-height inline-setup-bar",
  rule: "inset-bs-px block-px",
  fill: "bg-windows-accent",
  count: "text-caption",
};

const ANDROID_LOOK: StepProgressLook = {
  isBar: true,
  root: "flex-1 gap-md",
  track: "block-xs flex-1",
  rule: "inset-y-none",
  fill: "bg-native-button-primary",
  count:
    "ps-sm pe-lg text-native-first-launch-note/native-first-launch-note font-native-first-launch-note tracking-native-first-launch-note",
};

const STEP_PROGRESS_LOOKS = {
  android: ANDROID_LOOK,
  ios: DOTS_LOOK,
  linux: DOTS_LOOK,
  macos: DOTS_LOOK,
  windows: BAR_LOOK,
} satisfies Record<Platform, StepProgressLook>;

export function stepProgressLook(platform: Platform): StepProgressLook {
  return STEP_PROGRESS_LOOKS[platform];
}
