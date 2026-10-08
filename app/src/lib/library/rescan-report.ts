import type {
  FileChanges,
  LibraryFolder,
  RescanOutcome,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import { folderTitle } from "./folder-title";

type Named = (inputs: { name: string }) => string;
type Counted = (inputs: { count: number }) => string;

const KEPT_BOOKS = {
  unreachable: m.library_rescan_unreachable,
  foundEmpty: m.library_rescan_found_empty,
} satisfies Record<Exclude<RescanOutcome["kind"], "rescanned">, Named>;

const CHANGE_LINES = [
  ["added", m.library_rescan_added],
  ["updated", m.library_rescan_updated],
  ["moved", m.library_rescan_moved],
  ["removed", m.library_rescan_removed],
] as const satisfies readonly (readonly [keyof FileChanges, Counted])[];

const UNREADABLE_LINES = [
  ["unreadableBooks", m.library_folder_unreadable_books],
  ["unsupportedBooks", m.library_folder_unsupported_books],
  ["unreadableFolders", m.library_folder_unreadable_subfolders],
] as const satisfies readonly (readonly [keyof FileChanges, Counted])[];

/** One sentence per line, naming the home folder as the app does elsewhere. */
export function rescanReport(
  folder: LibraryFolder,
  outcome: RescanOutcome,
): string[] {
  const name = folderTitle(folder);
  if (outcome.kind !== "rescanned") {
    return [KEPT_BOOKS[outcome.kind]({ name })];
  }
  const changed = countedLines(outcome, CHANGE_LINES);
  const headline =
    changed.length === 0
      ? m.library_rescan_up_to_date({ name })
      : m.library_rescan_done({ name });
  return [headline, ...changed, ...countedLines(outcome, UNREADABLE_LINES)];
}

function countedLines(
  changes: FileChanges,
  lines: readonly (readonly [keyof FileChanges, Counted])[],
): string[] {
  return lines
    .filter(([change]) => changes[change] > 0)
    .map(([change, line]) => line({ count: changes[change] }));
}
