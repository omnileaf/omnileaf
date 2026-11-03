import { afterNavigate } from "$app/navigation";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

type AfterEachNavigation = (listener: () => void) => void;

const FOLLOWS_HISTORY_FOR_BACK = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export function followsHistoryForBack(platform: Platform): boolean {
  return FOLLOWS_HISTORY_FOR_BACK[platform];
}

export function followHistoryForBack(
  platform: () => Platform,
  afterEachNavigation: AfterEachNavigation = afterNavigate,
  follow: () => Promise<unknown> = commands.followBackHistory,
): void {
  afterEachNavigation(() => {
    if (followsHistoryForBack(platform())) {
      void follow();
    }
  });
}
