import { Channel } from "@tauri-apps/api/core";

import { boldTextChoice } from "#lib/accessibility/bold-text-choice.svelte.ts";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

type WatchBoldText = (
  onChange: (isBold: boolean) => void,
) => ReturnType<typeof commands.watchSystemBoldText>;

const FOLLOWS_SYSTEM_BOLD_TEXT = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

const watchWithCommand: WatchBoldText = (onChange) =>
  commands.watchSystemBoldText(new Channel(onChange));

export async function followSystemBoldText(
  platform: Platform,
  watch: WatchBoldText = watchWithCommand,
  choice = boldTextChoice,
): Promise<void> {
  if (!FOLLOWS_SYSTEM_BOLD_TEXT[platform]) {
    return;
  }
  const watched = await watch((isBold) => {
    choice.followSystem(isBold);
  });
  if (watched.status === "error") {
    reportError(watched.error);
  }
}
