import type { Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const SHOW_FILE = {
  ios: m.show_in_files,
  android: m.reader_show_file,
  macos: m.show_in_finder,
  windows: m.show_in_file_explorer,
  linux: m.reader_show_in_folder,
} satisfies Record<Platform, () => string>;

const SHOW_FOLDER = {
  ios: m.show_in_files,
  android: m.series_show_the_folder,
  macos: m.series_show_in_folder,
  windows: m.series_show_in_folder,
  linux: m.series_show_in_folder,
} satisfies Record<Platform, () => string>;

const OPENED_FROM = {
  ios: m.reader_opened_from_files,
  android: m.reader_opened_from_file_manager,
  macos: m.reader_opened_from_finder,
  windows: m.reader_opened_from_file_explorer,
  linux: m.reader_opened_from_file_manager,
} satisfies Record<Platform, () => string>;

export function showFileLabel(platform: Platform): string {
  return SHOW_FILE[platform]();
}

export function showFolderLabel(platform: Platform): string {
  return SHOW_FOLDER[platform]();
}

export function openedFromLabel(platform: Platform): string {
  return OPENED_FROM[platform]();
}
