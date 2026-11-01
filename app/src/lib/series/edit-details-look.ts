import type { ComponentProps } from "svelte";

import type Button from "#lib/components/ui/button/button.svelte";
import type { Platform } from "#lib/ipc/bindings.ts";

type ButtonChoice = Pick<
  ComponentProps<typeof Button>,
  "look" | "variant" | "class"
>;

export interface EditDetailsLook {
  readonly panel: string;
  readonly overlay: string;
  readonly header: string;
  readonly hasBadge: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly body: string;
  readonly actions: string;
  readonly cancel: ButtonChoice;
  readonly save: ButtonChoice;
}

const DEFAULT_BUTTON =
  "px-lg min-block-pointer-button touch:min-block-touch-target";

const WIDE_LOOK: EditDetailsLook = {
  panel:
    "inset-none m-auto flex flex-col overflow-hidden rounded-panel border border-dialog-edge bg-card text-foreground fade-motion shadow-dialog block-fit inline-edit-dialog max-block-edit-dialog-height max-inline-dialog-limit",
  overlay: "",
  header: "flex flex-col gap-2xs px-xl pbs-xl pbe-md",
  hasBadge: true,
  title: "text-title font-bold",
  subtitle: "text-label text-muted",
  body: "flex-1 overflow-y-auto min-block-none px-xl",
  actions: "flex justify-end gap-sm px-xl pbs-md pbe-xl",
  cancel: {
    look: "outline",
    class: `rounded-control font-medium ${DEFAULT_BUTTON}`,
  },
  save: {
    look: "filled",
    class: `rounded-control font-semibold ${DEFAULT_BUTTON}`,
  },
};

export const PHONE_EDIT_DETAILS_LOOK: EditDetailsLook = {
  ...WIDE_LOOK,
  panel: "inset-bs-sheet-top block-auto",
  header: "flex flex-col gap-2xs px-sheet-inline pbs-md",
  body: "flex-1 overflow-y-auto min-block-none px-sheet-inline",
  actions:
    "flex justify-end gap-sm border-bs border-border px-sheet-inline pbs-md pbe-sheet-bottom",
};

const MACOS_LOOK: EditDetailsLook = {
  panel:
    "inset-none inset-bs-native-sheet-top mx-auto flex flex-col gap-md overflow-hidden rounded-native-sheet bg-native-sheet p-sheet-inline text-foreground fade-motion shadow-native-sheet-lift block-fit inline-edit-dialog max-block-native-sheet-limit max-inline-dialog-limit",
  overlay: "bg-native-scrim",
  header: "flex flex-col gap-md",
  hasBadge: false,
  title:
    "text-native-sheet-title leading-native-sheet-title font-native-sheet-title",
  subtitle: "text-native-sheet-text leading-native-sheet-text text-foreground",
  body: "-mx-sheet-inline flex-1 overflow-y-auto px-sheet-inline py-2xs min-block-none",
  actions: "flex justify-end gap-sm mbs-sheet-inline",
  cancel: { variant: "secondary" },
  save: { variant: "primary" },
};

const LOOKS = {
  android: WIDE_LOOK,
  ios: WIDE_LOOK,
  linux: WIDE_LOOK,
  macos: MACOS_LOOK,
  windows: WIDE_LOOK,
} satisfies Record<Platform, EditDetailsLook>;

export function editDetailsLook(platform: Platform): EditDetailsLook {
  return LOOKS[platform];
}
