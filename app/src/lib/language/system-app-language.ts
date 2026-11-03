import { commands, type Platform } from "#lib/ipc/bindings.ts";

import type { LanguageSetting } from "./language.svelte";

type ReadSystemAppLanguage = typeof commands.systemAppLanguage;

const NAMES_SYSTEM_APP_LANGUAGE = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export async function followSystemAppLanguage(
  platform: Platform,
  language: LanguageSetting,
  read: ReadSystemAppLanguage = () => commands.systemAppLanguage(),
): Promise<void> {
  if (!NAMES_SYSTEM_APP_LANGUAGE[platform]) {
    return;
  }
  const result = await read();
  if (result.status === "error") {
    return;
  }
  language.systemOffersLanguage = result.data.offered;
  language.followSystemApp(result.data.tag);
}
