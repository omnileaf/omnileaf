import type { ChangeKind, VersionNotes } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import { changeGroups } from "./change-groups.ts";

export interface EarlierVersion {
  readonly notes: VersionNotes;
  readonly line: string;
}

const COUNTED = {
  breaking: m.whats_new_count_breaking,
  sec: m.whats_new_count_sec,
  feat: m.whats_new_count_feat,
  perf: m.whats_new_count_perf,
  fix: m.whats_new_count_fix,
} satisfies Record<ChangeKind, (inputs: { count: number }) => string>;

const isFix = ({ kind }: { kind: ChangeKind }) => kind === "fix";

function countsLine(notes: VersionNotes): string {
  if (notes.entries.every(isFix)) {
    return m.whats_new_fixes_only();
  }
  return changeGroups(notes)
    .map(({ kind, summaries }) => COUNTED[kind]({ count: summaries.length }))
    .join(" · ");
}

export function earlierVersions(
  earlier: readonly VersionNotes[],
): readonly EarlierVersion[] {
  const oldest = earlier.length - 1;
  return earlier.map((notes, index) => ({
    notes,
    line: index === oldest ? m.whats_new_first_release() : countsLine(notes),
  }));
}
