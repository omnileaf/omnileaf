import { Channel } from "@tauri-apps/api/core";

import {
  commands,
  type Platform,
  type SystemContrast,
} from "#lib/ipc/bindings.ts";

import { type Contrast, followContrast } from "./display-modes";

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

const DRAWN_CONTRAST = {
  standard: undefined,
  medium: "medium",
  high: "high",
} satisfies Record<SystemContrast, Contrast | undefined>;

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
    followContrast(DRAWN_CONTRAST[contrast]);
  });
}
