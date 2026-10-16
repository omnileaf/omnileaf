import { commands, type Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

export type PermissionState = "allowed" | "notAsked";

export type LinkedFolders = readonly string[] | undefined;

const SYSTEM_SETTINGS_LABELS = {
  android: m.permissions_open_android,
  ios: m.permissions_open_ios,
  macos: m.permissions_open_macos,
  windows: m.permissions_open_windows,
  linux: undefined,
} satisfies Record<Platform, (() => string) | undefined>;

export async function linkedFolderNames(): Promise<LinkedFolders> {
  const page = await commands.libraryFolders(null);
  if (page.status === "error") {
    return undefined;
  }
  return page.data.folders
    .filter((folder) => folder.kind === "linked")
    .map((folder) => folder.name);
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
