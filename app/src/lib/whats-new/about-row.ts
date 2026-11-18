import type { Platform, WhatsNew } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const HAS_WHATS_NEW = {
  android: true,
  ios: false,
  macos: false,
  windows: false,
  linux: false,
} as const satisfies Record<Platform, boolean>;

export function hasWhatsNew(platform: Platform): boolean {
  return HAS_WHATS_NEW[platform];
}

export function whatsNewRowHint(
  platform: Platform,
  { installed, earlier }: WhatsNew,
): string | undefined {
  if (!hasWhatsNew(platform) || installed === null) {
    return undefined;
  }
  return earlier.length === 0
    ? m.whats_new_hint({ version: installed.version })
    : m.whats_new_hint_with_earlier({ version: installed.version });
}
