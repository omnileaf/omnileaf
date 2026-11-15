import { commands, type Platform } from "#lib/ipc/bindings.ts";

import type { TimeFormatSetting } from "./time-format.svelte";

type ReadSystemClock = typeof commands.systemClock;

const NAMES_SYSTEM_CLOCK = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export async function followSystemClock(
  platform: Platform,
  timeFormat: TimeFormatSetting,
  read: ReadSystemClock = () => commands.systemClock(),
): Promise<void> {
  if (!NAMES_SYSTEM_CLOCK[platform]) {
    return;
  }
  const result = await read();
  if (result.status === "error") {
    return;
  }
  timeFormat.followSystemClock(result.data);
}
