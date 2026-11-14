import { Channel } from "@tauri-apps/api/core";

import {
  commands,
  type Platform,
  type SystemContrast,
} from "#lib/ipc/bindings.ts";

import { contrastChoice } from "./contrast-choice.svelte.ts";

type WatchContrast = (
  onChange: (contrast: SystemContrast) => void,
) => Promise<unknown>;

const FOLLOWS_SYSTEM_CONTRAST = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

function watchWithCommand(
  onChange: (contrast: SystemContrast) => void,
): Promise<unknown> {
  return commands.watchSystemContrast(new Channel(onChange));
}

export function followSystemContrast(
  platform: Platform,
  watch: WatchContrast = watchWithCommand,
): void {
  if (!FOLLOWS_SYSTEM_CONTRAST[platform]) {
    return;
  }
  void watch((contrast) => {
    contrastChoice.followSystem(contrast);
  });
}
