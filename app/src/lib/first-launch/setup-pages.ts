import type { Platform } from "#lib/ipc/bindings.ts";

const USES_SETUP_PAGES = {
  android: false,
  ios: false,
  linux: false,
  macos: false,
  windows: true,
} satisfies Record<Platform, boolean>;

export function usesSetupPages(platform: Platform): boolean {
  return USES_SETUP_PAGES[platform];
}
