import type { Platform } from "$lib/ipc/bindings";

import type { WidthClass } from "./breakpoints";

const IS_POINTER = {
  android: false,
  ios: false,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, boolean>;

export function isPointer(platform: Platform): boolean {
  return IS_POINTER[platform];
}

export function isPhone(platform: Platform, width: WidthClass): boolean {
  return !isPointer(platform) && width === "compact";
}
