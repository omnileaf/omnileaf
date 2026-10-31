import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
import type { KeyCombination } from "#lib/screenshot-mode/key-combination.ts";

export const PANE_SHORTCUT: KeyCombination = { letter: "B", shift: false };

export function paneShortcutKeys(platform: Platform): string {
  return `${usesCommandKey(platform) ? "Meta" : "Control"}+${PANE_SHORTCUT.letter}`;
}

export function isPaneToggledBy(
  platform: Platform,
  { isCompact }: { readonly isCompact: boolean },
): boolean {
  return platform !== "windows" || !isCompact;
}
