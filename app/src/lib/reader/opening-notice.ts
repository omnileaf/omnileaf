import type { Platform } from "#lib/ipc/bindings.ts";

const SAYS_WHERE_A_BOOK_OPENED = {
  android: false,
  ios: true,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, boolean>;

export function saysWhereABookOpened(platform: Platform): boolean {
  return SAYS_WHERE_A_BOOK_OPENED[platform];
}
