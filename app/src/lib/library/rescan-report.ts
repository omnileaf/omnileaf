import type {
  FileChanges,
  LibraryFolder,
  RescanOutcome,
} from "#lib/ipc/bindings.ts";
import { assertNever } from "#lib/assert-never.ts";
import { m } from "#lib/paraglide/messages.js";

import { folderTitle } from "./folder-title";

type Counted = (inputs: { count: number }) => string;

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

/** One sentence per line, naming the home folder as the app does elsewhere, and none for a folder found empty, which its row warns of. */
export function rescanReport(
  folder: LibraryFolder,
  outcome: RescanOutcome,
): string[] {
  const name = folderTitle(folder);
  switch (outcome.kind) {
    case "unreachable":
      return [m.library_rescan_unreachable({ name })];
    case "foundEmpty":
      return [];
    case "rescanned":
      return rescannedReport(name, outcome);
    default:
      return assertNever(outcome);
  }
}

function rescannedReport(name: string, outcome: FileChanges): string[] {
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
