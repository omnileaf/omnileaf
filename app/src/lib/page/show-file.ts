import type { Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const SHOW_FILE = {
  ios: m.show_in_files,
  android: m.reader_show_file,
  macos: m.show_in_finder,
  windows: m.show_in_file_explorer,
  linux: m.reader_show_in_folder,
} satisfies Record<Platform, () => string>;

export function showFileLabel(platform: Platform): string {
  return SHOW_FILE[platform]();
}
