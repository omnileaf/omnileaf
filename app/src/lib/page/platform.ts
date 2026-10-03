import type { Platform } from "$lib/ipc/bindings";

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
