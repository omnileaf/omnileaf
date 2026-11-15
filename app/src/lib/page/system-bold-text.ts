import { boldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

const FOLLOWS_SYSTEM_BOLD_TEXT = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export async function followSystemBoldText(
  platform: Platform,
  readSystem: typeof commands.systemBoldText = commands.systemBoldText,
  choice = boldTextChoice,
): Promise<void> {
  if (!FOLLOWS_SYSTEM_BOLD_TEXT[platform] || choice.hasChoice) {
    return;
  }
  const read = await readSystem();
  if (read.status === "error") {
    reportError(read.error);
    return;
  }
  choice.followSystem(read.data);
}
