import type { Platform } from "#lib/ipc/bindings.ts";

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

const USES_COMMAND_KEY = {
  android: false,
  ios: true,
  linux: false,
  macos: true,
  windows: false,
} satisfies Record<Platform, boolean>;

export function usesCommandKey(platform: Platform): boolean {
  return USES_COMMAND_KEY[platform];
}

function isPlatform(name: string | undefined): name is Platform {
  return name !== undefined && Object.hasOwn(IS_POINTER, name);
}

export function followCorePlatform(platform: Platform): void {
  document.documentElement.dataset.platform = platform;
}

export function currentPlatform(): Platform {
  const marked = document.documentElement.dataset.platform;
  return isPlatform(marked) ? marked : "linux";
}

const HAS_NATIVE_LOOK = {
  android: true,
  ios: true,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export function hasNativeLook(platform: Platform): boolean {
  return HAS_NATIVE_LOOK[platform];
}
