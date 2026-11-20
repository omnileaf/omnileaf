import {
  commands,
  type NotificationAccess,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { readFolderList } from "#lib/library/library-folders.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

export type PermissionState = "allowed" | "notAsked" | "notAllowed";

export interface PermissionRowWords {
  readonly description: string;
  readonly state: PermissionState | undefined;
}

export type LinkedFolders = readonly string[] | undefined;

const SYSTEM_SETTINGS_LABELS = {
  android: m.permissions_open_android,
  ios: m.permissions_open_ios,
  macos: m.permissions_open_macos,
  windows: m.permissions_open_windows,
  linux: undefined,
} satisfies Record<Platform, (() => string) | undefined>;

export async function linkedFolderNames(): Promise<LinkedFolders> {
  const folders = await readFolderList(commands.libraryFolders);
  return folders.kind === "loaded"
    ? folders.linked.map((folder) => folder.name)
    : undefined;
}

export function permissionsSummary(linked: LinkedFolders): string {
  if (linked === undefined) {
    return "";
  }
  return linked.length > 0
    ? m.permissions_summary_folders_allowed()
    : m.permissions_summary_nothing_asked();
}

export function foldersState(
  linked: LinkedFolders,
): PermissionState | undefined {
  if (linked === undefined) {
    return undefined;
  }
  return linked.length > 0 ? "allowed" : "notAsked";
}

export function foldersDescription(
  platform: Platform,
  linked: LinkedFolders,
): string {
  if (platform !== "android" || linked === undefined || linked.length === 0) {
    return m.permissions_folders_picked();
  }
  const folders = new Intl.ListFormat(getLocale(), {
    type: "conjunction",
  }).format(linked);
  return m.permissions_folders_picked_android({ folders });
}

export function systemSettingsLabel(platform: Platform): string | undefined {
  return SYSTEM_SETTINGS_LABELS[platform]?.();
}

export function notificationsRow(
  checksForUpdates: boolean,
  access: NotificationAccess | undefined,
): PermissionRowWords {
  if (!checksForUpdates) {
    return {
      description: m.permissions_notifications_help(),
      state: "notAsked",
    };
  }
  return {
    description: m.permissions_notifications_updates_help(),
    state: access,
  };
}
