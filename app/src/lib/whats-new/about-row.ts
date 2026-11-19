import type { Platform, WhatsNew } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const LISTS_WHATS_NEW_IN_ABOUT = {
  android: true,
  ios: false,
  macos: false,
  windows: false,
  linux: false,
} as const satisfies Record<Platform, boolean>;

export function whatsNewRowHint(
  platform: Platform,
  { installed, earlier }: WhatsNew,
): string | undefined {
  if (!LISTS_WHATS_NEW_IN_ABOUT[platform] || installed === null) {
    return undefined;
  }
  return earlier.length === 0
    ? m.whats_new_hint({ version: installed.version })
    : m.whats_new_hint_with_earlier({ version: installed.version });
}
