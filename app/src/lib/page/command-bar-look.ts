import type { ButtonLook } from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

export interface CommandBarLook {
  readonly look: ButtonLook;
  readonly icon: string;
  readonly label: string;
}

const WINDOWS_COMMAND_BAR: CommandBarLook = {
  look: "command",
  icon: "shrink-0 block-native-command-icon inline-native-command-icon",
  label:
    "text-native-command-label leading-native-command-label font-native-command-label",
};

export function commandBarLook(platform: Platform): CommandBarLook | undefined {
  return platform === "windows" ? WINDOWS_COMMAND_BAR : undefined;
}
